import numpy as np
import os
import glob
import re
import struct
import json

### "Note: This ETL pipeline is intended for local preprocessing. The processed assets are served via AWS S3 in production." ###

# --- CONFIGURAÇÃO ---
# Caminho para o dataset original (Ex: Stanford S3DIS)
DATASET_ROOT = os.path.join("..", "data", "S3DIS_Raw")
OUTPUT_DIR = os.path.join("public", "scans")

# URL DO SEU BUCKET S3 (Ajuste com o nome real que você criou na AWS)
# Exemplo: https://nextgen-aec-assets.s3.amazonaws.com
# IMPORTANTE: Não coloque a barra '/' no final aqui.
# O script assume que você vai subir a pasta 'scans' para a raiz do bucket.
# Correção: Adicionamos 'us-east-1' no domínio
CLOUD_BASE_URL = "https://nextgen-aec-assets.s3.us-east-1.amazonaws.com"

# Mapeamento S3DIS
CLASS_MAP = {
    'ceiling': 0, 'floor': 1, 'wall': 2, 'beam': 3, 'column': 4,
    'window': 5, 'door': 6, 'table': 7, 'chair': 8, 'sofa': 9,
    'bookcase': 10, 'board': 11, 'clutter': 12, 'stairs': 13
}

# --- QUALIDADE MÁXIMA ---
# 1 = Todos os pontos (Sem redução - Arquivos pesados, mas bonitos)
# 2 = Metade dos pontos (Recomendado para web se os arquivos ficarem > 50MB)
SKIP_RATE = 1 

os.makedirs(OUTPUT_DIR, exist_ok=True)

def clean_float(s):
    s_clean = re.sub(r'[^\d.-]', '', s)
    try:
        return float(s_clean)
    except:
        return None

def safe_loadtxt(filepath):
    clean_data = []
    with open(filepath, 'r', errors='ignore') as f:
        for line in f:
            parts = line.split()
            if len(parts) >= 6:
                try:
                    row = [float(x) for x in parts[:6]]
                    clean_data.append(row)
                except ValueError:
                    row = [clean_float(x) for x in parts[:6]]
                    if None in row: continue 
                
    return np.array(clean_data)

def write_custom_ply(filename, points, colors, labels, object_ids):
    """
    Grava PLY com: XYZ(float), RGB(uchar), Label(uchar), ObjectId(uint16)
    """
    count = len(points)
    # print(f"Salvando {count} pontos em {filename}...")
    
    with open(filename, 'wb') as f:
        header = f"""ply
format binary_little_endian 1.0
element vertex {count}
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
property uchar label
property uint16 objectId
end_header
"""
        f.write(header.encode('ascii'))
        
        # Normalização de cores
        if colors.max() <= 1.0:
            colors = (colors * 255).astype(np.uint8)
        else:
            colors = colors.astype(np.uint8)
            
        labels = labels.astype(np.uint8)
        object_ids = object_ids.astype(np.uint16)
        points = points.astype(np.float32)
        
        # Estrutura Binária
        data = np.zeros(count, dtype=[
            ('x', 'f4'), ('y', 'f4'), ('z', 'f4'),
            ('r', 'u1'), ('g', 'u1'), ('b', 'u1'),
            ('label', 'u1'),
            ('objectId', 'u2') # u2 = uint16
        ])
        
        data['x'] = points[:, 0]
        data['y'] = points[:, 1]
        data['z'] = points[:, 2]
        data['r'] = colors[:, 0]
        data['g'] = colors[:, 1]
        data['b'] = colors[:, 2]
        data['label'] = labels.flatten()
        data['objectId'] = object_ids.flatten()
        
        f.write(data.tobytes())

def process_semantic_area_1():
    manifest = {}
    
    # --- PROCESSANDO AREA 1 COMPLETA ---
    area_path = os.path.join(DATASET_ROOT, "Area_1")
    area_name = "Area_1"
    
    if not os.path.exists(area_path):
        print(f"Erro: {area_path} não encontrado.")
        return

    print(f"--- Iniciando Processamento: {area_name} ---")
    manifest[area_name] = []
    
    # 1. Ler Alinhamento Global
    alignment_file = os.path.join(area_path, f"{area_name}_alignmentAngle.txt")
    alignments = {}
    if os.path.exists(alignment_file):
        with open(alignment_file, 'r') as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2 and not line.startswith('#'):
                    try:
                        alignments[parts[0]] = float(parts[-1])
                    except: pass

    # 2. Varrer Salas
    subfolders = sorted(glob.glob(os.path.join(area_path, "*")))
    
    for room_path in subfolders:
        if not os.path.isdir(room_path): continue
        room_name = os.path.basename(room_path)
        
        # Ignora pastas de sistema ou anotações globais
        if room_name == "Annotations": continue
        
        # Verifica se tem dados BIM (Anotações)
        annotations_dir = os.path.join(room_path, "Annotations")
        if not os.path.exists(annotations_dir): 
            # print(f"Skipping {room_name}: Sem anotações.")
            continue

        output_filename = f"{area_name}_{room_name}.ply"
        objects_filename = f"{area_name}_{room_name}_objects.json"
        
        output_full_path = os.path.join(OUTPUT_DIR, output_filename)
        objects_full_path = os.path.join(OUTPUT_DIR, objects_filename)
        
        # --- CRIAÇÃO DO MANIFESTO COM LINK DO S3 ---
        # Aqui definimos que o App vai buscar na nuvem, mesmo que estejamos salvando local agora.
        manifest[area_name].append({
            "name": room_name,
            # Se você subir a pasta 'scans' para o bucket, os arquivos estarão em /scans/
            "file": f"{CLOUD_BASE_URL}/scans/{output_filename}",
            "objects": f"{CLOUD_BASE_URL}/scans/{objects_filename}"
        })

        # Verifica se arquivo já existe localmente para pular processamento (cache simples)
        if os.path.exists(output_full_path):
            print(f"-> {room_name} (Já processado, adicionado ao manifesto)")
            continue

        print(f"Processando {room_name}...")

        all_points = []
        all_colors = []
        all_labels = [] 
        all_object_ids = []
        object_metadata = [] 
        
        obj_files = glob.glob(os.path.join(annotations_dir, "*.txt"))
        
        current_object_id = 1
        
        for obj_file in obj_files:
            try:
                filename = os.path.basename(obj_file)
                name_parts = filename.split('.')[0] # ex: chair_1
                class_str = name_parts.split('_')[0] # ex: chair
                class_id = CLASS_MAP.get(class_str, 12) 

                data = safe_loadtxt(obj_file)
                if len(data) == 0: continue
                
                # Aplica SKIP_RATE
                data = data[::SKIP_RATE]

                points_chunk = data[:, 0:3]
                colors_chunk = data[:, 3:6] / 255.0 
                
                labels_chunk = np.full((len(data), 1), class_id)
                ids_chunk = np.full((len(data), 1), current_object_id)

                all_points.append(points_chunk)
                all_colors.append(colors_chunk)
                all_labels.append(labels_chunk)
                all_object_ids.append(ids_chunk)
                
                # Metadados para a lista lateral
                object_metadata.append({
                    "id": current_object_id,
                    "name": name_parts,
                    "class": class_str,
                    "count": len(points_chunk)
                })
                
                current_object_id += 1
                
            except Exception as e:
                print(f"Erro em {os.path.basename(obj_file)}: {e}")

        if not all_points: continue

        # Merge
        points = np.vstack(all_points)
        colors = np.vstack(all_colors)
        labels = np.vstack(all_labels)
        object_ids = np.vstack(all_object_ids)

        # Rotações e Alinhamento
        angle = alignments.get(room_name, 0)
        angle_rad = np.deg2rad(angle)
        c, s = np.cos(angle_rad), np.sin(angle_rad)
        Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]) # Alinha Horizontal
        R_fix = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]]) # Z-up -> Y-up
        
        points = points @ Rz.T
        points = points @ R_fix.T

        # Gravar Arquivos LOCAIS
        write_custom_ply(output_full_path, points, colors, labels, object_ids)
        
        with open(objects_full_path, "w") as f:
            json.dump(object_metadata, f, indent=2)

    # Salvar Manifesto Global
    with open(os.path.join("public", "dataset_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    
    print("\n--- PROCESSAMENTO CONCLUÍDO ---")
    print("1. O arquivo 'public/dataset_manifest.json' foi atualizado com links do S3.")
    print("2. Os arquivos .PLY estão na pasta 'public/scans'.")
    print("3. AGORA: Faça o upload manual da pasta 'public/scans' para o seu Bucket S3.")

if __name__ == "__main__":
    process_semantic_area_1()