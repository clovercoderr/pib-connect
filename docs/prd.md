# Product Requirements Document (PRD)

## 1. Document Control

Product: PIB Connect
Version: 2.1
Status: Living document
Last updated: 2026-03-10
Primary platform: Tauri desktop app
Tech stack: React, TypeScript, Zustand, React Three Fiber, Blockly, Monaco, Tauri 2, Rust
Related documents: `docs/features.md`

## 2. Executive Summary

PIB Connect is a desktop application for controlling, visualizing, calibrating, and programming a PIB robot. It combines a real-time 3D digital twin with two authoring modes, manual robot control, simulation-first execution, and project persistence.

The product does not replace pib-backend. Instead, it depends on pib-backend for robot-facing services such as motor access, saved poses, remote program execution, and ROSBridge-based live motion updates.

The current product direction is:

- safe by default through simulator-first execution
- fast visual feedback through a high-performance 3D twin
- gradual progression from manual control to blocks to Python
- desktop-friendly workflows such as menu shortcuts, local project files, and offline persistence

## 3. Problem Statement

PIB users currently need several disconnected workflows to:

- move the robot precisely
- see what the robot will do before executing it
- author simple behaviors without writing full code
- switch to code when they outgrow blocks
- calibrate motors without opaque configuration files
- save and reopen complete robot-control workspaces

PIB Connect solves this by providing one desktop workspace where users can inspect the robot, manipulate it manually, author behavior visually or textually, validate runs in a simulator, and only then target the physical robot.

## 4. Target Users

### Primary Users

- Robotics developers who need both direct manipulation and code authoring
- Robot operators who need safe visual control and repeatable poses
- Technical educators and workshop facilitators who need a blocks-first workflow

### Secondary Users

- QA and demo teams validating robot sequences before showing them on hardware
- Integrators working with pib-backend and ROSBridge environments

## 5. Product Goals

### Core Goals

- Provide a responsive digital twin for the PIB robot with grouped manual controls
- Support both no-code and Python-based program authoring in the same product
- Default users to a simulator flow before robot execution
- Persist projects, poses, and calibration data locally
- Connect to pib-backend and ROSBridge without manual code changes

### Success Criteria for the Current Product

- A user can create a project, author a simple behavior, and run it in the simulator without external tooling.
- A connected user can validate backend reachability from the app and run a program on the real robot.
- A user can calibrate joints using a guided flow and export or import the resulting calibration data.
- The 3D viewer remains usable during manual manipulation and program authoring.

## 6. Non-Goals

- Replacing pib-backend with a standalone robot platform
- Shipping a general-purpose Python runtime inside the simulator
- Cloud collaboration or multi-user editing
- Full UI coverage for every backend domain already present in the API client
- Production telemetry, motor feedback streaming, or emergency-stop orchestration in this release

## 7. Product Scope Overview

The current in-scope product pillars are:

1. Digital twin and manual robot control
2. Project creation, loading, saving, and reopening
3. Blockly and Python authoring
4. Simulator and real-robot execution switching
5. Pose and calibration management
6. Desktop shell integration through Tauri menus and dialogs

## 8. Functional Requirements

### FR-01 Project Lifecycle

The system shall:

- create two project types: `code` and `live`
- allow project creation from the in-app project browser and the dedicated Tauri new-project window
- open project files from disk
- save projects to disk in `.pib` JSON format
- reopen locally remembered projects from local storage
- preserve project metadata, Blockly workspace, Python source, and saved poses
- display the current project name in the top bar

### FR-02 Workspace Layout and Navigation

The system shall:

- show `3d-view`, `no-code`, and `python` tabs for code projects
- lock live projects to the 3D control workflow only
- support a split view between 3D and editor content
- allow the split ratio to be adjusted interactively within bounded limits
- expose key navigation through desktop menu items and keyboard shortcuts

### FR-03 3D Digital Twin

The system shall:

- render the PIB robot from the URDF asset pipeline
- show loading and error states for model initialization
- support six view presets: full, head, right arm, left arm, right hand, left hand
- reflect joint-state changes without requiring full React rerenders each frame
- keep the viewer active while used in standalone or split mode

### FR-04 Manual Robot Control

The system shall:

- expose control for 30 joints across neck, arms, and both hands
- keep all joint values within the 0 to 1023 servo range
- provide a slider-based control panel grouped by body area
- expose aggregate finger-grip sliders for faster hand positioning
- allow direct manipulation through 3D drag handles
- provide a one-click reset to default positions

When the backend connection is available, the system shall send live motion commands through ROSBridge. When it is not available, the system shall continue to update local state so the digital twin remains usable.

### FR-05 Pose Management

The system shall:

- save the current robot state as a named pose
- apply a saved pose back to the robot state
- rename and delete saved poses
- merge locally stored poses with backend poses during fetch
- keep poses available offline through local storage persistence

### FR-06 Blockly Authoring

The system shall:

- provide a Blockly workspace with PIB-specific blocks plus standard logic, math, text, and variable blocks
- regenerate Python code automatically when the workspace changes
- persist the Blockly workspace as part of the project
- support at least the following PIB blocks: move to pose, set motor, wait, repeat, print

### FR-07 Python Authoring

The system shall:

- provide a Python editor optimized for desktop use
- allow editing generated or hand-written Python
- preserve Python source inside the project file
- autosave Python content locally during editing sessions
- show a lightweight PIB API reference inside the app

### FR-08 Program Execution

The system shall:

- provide explicit execution-target switching between `simulator` and `robot`
- default the execution target to `simulator`
- allow program execution from both the Blockly flow and the Python flow
- provide stop controls while execution is in progress
- show output in a docked console
- block robot execution when backend health is not connected

For real-robot execution, the system shall create backend program entries and invoke remote execution through pib-backend.

### FR-09 Local Simulation

The system shall:

- execute Blockly block chains locally
- execute a constrained subset of PIB-style Python locally
- support `pib.apply_pose`, `pib.set_motor`, `time.sleep`, `print`, and `for ... in range(...)`
- restore the starting robot pose when a simulation is stopped
- produce readable progress output for each step

The simulator is not required to support arbitrary Python semantics in this release.

### FR-10 Connectivity and Settings

The system shall:

- allow the user to set the robot IP, REST API port, and ROSBridge port
- test backend reachability from inside the app
- poll backend health periodically
- support mock mode for non-hardware workflows
- reconnect ROSBridge when connection settings change
- update the Vite dev proxy target at runtime during local development

### FR-11 Calibration

The system shall:

- provide a guided calibration wizard across the major body groups
- support three capture points per joint: min, neutral, max
- keep calibration live while the user manipulates joints
- import and export calibration JSON
- merge new calibration values with existing calibration data on save
- support automatic calibration seeding from backend motor rotation ranges when the robot is reachable

### FR-12 Debug and About Views

The system shall:

- expose a debug view listing motor IDs, labels, and current values by body group
- expose an about view summarizing the product and stack

### FR-13 Desktop Shell Integration

The system shall:

- provide native desktop menus for file, view, program, PIB, window, and help actions
- support opening a separate new-project window through Tauri
- support desktop file dialogs for save and open operations

## 9. Data Model Requirements

### Project File Model

Project files shall store:

- schema version
- project name
- project type
- creation and update timestamps
- saved poses
- Blockly workspace JSON
- Python code

### Pose Model

Each pose shall store:

- unique identifier
- name
- a full map of motor or joint positions

### Calibration Model

Calibration shall be stored per joint as:

- `zeroPoint`
- `minRange`
- `maxRange`

The UI may derive those values from captured min, neutral, and max points.

## 10. External Interfaces and Integrations

### pib-backend REST

The app currently relies on pib-backend REST endpoints for:

- motors
- poses
- programs
- health validation

Additional client-ready domains already exist in the codebase but are not yet surfaced as main UI features:

- bricklets
- camera settings
- chat
- personality
- assistant model
- host IP

### ROSBridge WebSocket

The app uses ROSBridge for live motion updates through `/apply_joint_trajectory`. This is the active robot-motion transport for the current main UX.

### Tauri Serial Backend

The repository contains a direct serial path for:

- serial port enumeration
- serial and mock connection
- single and batch motor-position packets
- Dynamixel-style packet generation in Rust

This path is currently a secondary technical capability rather than the primary user-facing transport.

## 11. Non-Functional Requirements

### Performance

- Target responsive 3D interaction suitable for desktop use, with 60 FPS as the working rendering target where hardware allows.
- Avoid blocking UI updates during backend communication.
- Keep 3D joint updates outside avoidable React rerender loops.

### Safety

- Default program execution to the simulator.
- Require positive backend connectivity before real-robot execution.
- Keep stop behavior predictable by restoring the simulator start pose.

### Reliability

- Persist critical user data locally: projects, poses, calibration, connection settings, and Python autosave.
- Fail gracefully when the backend is unavailable.
- Reconnect ROSBridge automatically after socket loss.

### Maintainability

- Keep control logic separated across focused Zustand stores and API libraries.
- Preserve typed boundaries between UI, project state, motion state, execution state, and backend integration.

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Backend unavailable | Robot execution and pose sync fail | Keep simulator-first workflow and local persistence |
| Simulator behavior drifts from robot behavior | Users trust incorrect results | Keep the simulator subset explicit and validate critical behaviors on hardware |
| Incorrect calibration | Physical motion becomes unsafe or inaccurate | Guided wizard, import/export, and sync-from-robot starting values |
| URDF or asset load failure | 3D workspace becomes unusable | Dedicated loading and error states |
| Too much hidden integration scope | Product docs and QA become unclear | Separate current UX features from latent client capabilities |

## 13. Release Acceptance Criteria

The current release is acceptable when the following workflows are possible end to end:

1. Create a code project, place Blockly blocks, generate Python, run in the simulator, and inspect output.
2. Create or load a project, save it as a `.pib` file, reopen it, and recover blocks, poses, and Python.
3. Open the settings modal, test robot connectivity, switch execution target to robot, and execute a program only when connected.
4. Save, rename, apply, and delete poses without losing local persistence.
5. Complete the calibration wizard for at least one body group and export the resulting JSON.

## 14. Roadmap and Follow-Up Scope

High-value next steps after the current scope:

- expose camera, bricklet, chat, and personality features in the primary UI
- add richer simulator semantics and better parity with pib-backend runtime behavior
- surface telemetry and robot feedback loops
- add a dedicated emergency-stop workflow
- decide whether the Tauri serial path remains a fallback or becomes a first-class transport again
- add automated coverage for core project, execution, and calibration flows

## 15. Open Questions

- Should direct serial control become a first-class user option again, or remain an internal backup path?
- What level of simulator fidelity is required before users can trust a run without robot-side validation?
- Which of the already implemented API client domains should be promoted into the next visible product surface?
- How should project-file versioning evolve once more backend-linked metadata is added?
