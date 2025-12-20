# BDD Scenario: LiDAR Point Cloud Viewer

**ID**: SCN-001
**Status**: Implemented
**Last Updated**: 2025-12-20

---

## Feature: Point Cloud Visualization

### Scenario 1: Load Room from Manifest

```gherkin
Feature: Room Selection

  Scenario: User selects room from sidebar
    Given the NextGen AEC viewer is loaded
    And the dataset manifest is fetched
    When the user selects "conferenceRoom_1" from the room list
    Then the PLY file should download from CDN
    And a loading indicator should appear
    And the point cloud should render at 60fps
    And the camera should auto-fit to bounds
```

### Scenario 2: Quality Preset Change

```gherkin
Feature: LOD Quality Control

  Scenario: User changes quality preset
    Given a point cloud is loaded with 2M points
    When the user changes quality preset from 1 to 25
    Then the point count should reduce to ~80K
    And the geometry should update without re-download
    And the frame rate should increase
```

### Scenario 3: Object Selection

```gherkin
Feature: Semantic Object Selection

  Scenario: User clicks on object
    Given a point cloud with semantic labels is loaded
    When the user clicks on a chair
    Then the chair points should highlight (pulsing red)
    And the sidebar should show "chair_5 (Chair)"
    And the shader uniform uSelectedId should update
```

### Scenario 4: Smart Measurement

```gherkin
Feature: Smart Ghosts Measurement

  Scenario: User measures floor to ceiling
    Given measurement mode is active
    When the user clicks near the floor
    Then Smart Ghost candidates should appear
    And pressing "1" should snap to ceiling
    And the distance should display in meters (3 decimals)
```

---

## Non-Functional Constraints

| Constraint | Requirement | Current |
|------------|-------------|---------|
| Frame Rate | 60fps minimum | 60fps |
| Load Time | <3s (cached) | ~2s |
| Quality Switch | <500ms | ~300ms |
| Raycasting | Non-blocking | 4fps throttle |

---

**Related**: [01_critical_scenarios.md](../01_critical_scenarios.md)
