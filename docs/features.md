# PIB Connect Feature Inventory

Last updated: 2026-05-17
Source of truth: current repository implementation
Audience: product, engineering, design, QA

## 1. Product Summary

PIB Connect is a desktop digital-twin and programming environment for PIB robots.
It combines real-time 3D visualization, manual robot control via a rotation-arc
gizmo, Blockly and Python authoring, simulation-first execution, project
persistence, per-joint calibration, and an integrated AI assistant. The
application complements pib-backend rather than replacing it.

This document separates:

- user-visible features wired into the main app
- integration capabilities present in the codebase
- technical reserve features that exist in Tauri or shared libraries but are not
  the primary UX today

## 2. Product Modes and Navigation

### Project Types

| Project Type | Purpose | Current Behavior |
| --- | --- | --- |
| Code | Build programs with blocks or Python while keeping the 3D twin visible | Exposes 3D, Controls, Poses, Blocks, Python, and AI tabs, plus optional split view |
| Live | Direct robot manipulation without editor workflow | Opens straight into the 3D live-control view |

### Main Navigation Features

- Top bar with project switcher, tab pill navigation, run/stop controls,
  execution-target toggle (Sim / Robot), split-view toggle, and settings access
- In-app project browser for create, open, delete, and load-from-file workflows
- Dedicated Tauri new-project window that can be opened from the desktop menu
- Adjustable split view between 3D scene and editor, clamped to a 30/70 to 70/30
  width range

### Desktop Menu and Shortcuts

| Action | Shortcut |
| --- | --- |
| Create project | Cmd+N |
| Open project | Cmd+O |
| Save project | Cmd+S |
| Close project | Cmd+W |
| 3D view | Cmd+1 |
| Controls | Cmd+2 |
| Poses | Cmd+3 |
| Blocks | Cmd+4 |
| Python | Cmd+5 |
| AI | Cmd+6 |
| Toggle split view | Cmd+\\ |
| Run program | Cmd+R |
| Stop program | Cmd+. |
| Settings | Cmd+, |
| Documentation link | Cmd+/ |

## 3. Digital Twin and Manual Control

### 3D Viewer

- URDF-based 3D robot rendering using React Three Fiber and `urdf-loader`
- Loading state and error state for model failures
- High-performance canvas configuration with DPR limit, demand-rendering fallback,
  and direct joint updates
- Camera controller driven by body-part presets with smooth eased transitions
- Floating camera controls (zoom in, zoom out, reset zoom, robot reset) rendered
  as glass-tone `IconButton` primitives

### View Presets

| Preset | Focus |
| --- | --- |
| Full | Whole robot |
| Head | Neck and head |
| Right Arm | Right shoulder, elbow, wrist |
| Left Arm | Left shoulder, elbow, wrist |
| Right Hand | Right-hand fingers and thumb |
| Left Hand | Left-hand fingers and thumb |

### Joint Coverage

The app currently defines and controls 30 joints across five groups:

| Group | Joint Count | Coverage |
| --- | --- | --- |
| Neck | 2 | pan, tilt |
| Right Arm | 4 | shoulder inner, shoulder outer, elbow, wrist |
| Left Arm | 4 | shoulder inner, shoulder outer, elbow, wrist |
| Right Hand | 10 | thumb, index, middle, ring, pinky, each with proximal and distal |
| Left Hand | 10 | thumb, index, middle, ring, pinky, each with proximal and distal |

### Manual Control Features

- Right-side control panel for live joint sliders
- Group-aware slider visibility based on the active view preset
- Hand-grip shortcut slider that drives all finger joints together
- One-click reset of all joints to defaults
- Joint values clamped to the configured motor range per joint
- Direct drag interaction on the 3D rotation arcs (the big colored circles)

### 3D Rotation Gizmo

The 3D viewer's manipulation surface is built around a rotation-arc gizmo,
modeled on professional 3D tools:

- Clicking a joint handle selects it and reveals one colored rotation arc per
  axis the joint can rotate on (peach = pan/nod, sky = tilt/lift, lavender = twist/roll)
- Arcs are the **only** rotation surface — the small ring acts purely as a
  click-to-select target. Hand-grip handles are the one exception (they have no
  arc; their ring still drives the "curl fingers" gesture)
- Plane-projection rotation: the pointer ray is cast onto the joint's rotation
  plane and the angle around the pivot drives the joint 1:1. Grab anywhere on
  the arc, circle the pivot, the joint follows — independent of camera angle
- Smooth-chase loop low-passes pointer jitter so every release eases into the
  final pose
- Active arc brightens with a subtle opacity pulse; non-active arcs fade so the
  grabbed one is the sole point of attention
- Edge-on arcs (axis nearly aligned with the view direction) fade automatically
  so the viewer stays uncluttered
- Arcs turn red when the underlying joint hits its motion limit
- Combined handles for the neck and shoulders animate two axes simultaneously
  when the central ring is dragged in pairing-style mode
- Live world-space tracking for head, arms, and hands powers camera presets and
  downstream features

### Body Collision

- URDF-defined joint limits clamp every joint outside pairing mode, preventing
  arms and other limbs from rotating into the torso
- Pairing mode intentionally bypasses the limits so each motor can be driven to
  its physical zero independent of pose constraints

## 4. Pose Management

- Save the robot's current full-body state as a named pose
- Apply any stored pose back to the robot state
- Rename and delete poses
- Merge local poses with backend poses on load, with local names taking precedence
- Persist poses locally for offline use; best-effort backend sync on write
- Project-scoped pose collections (poses follow the active project)

## 5. Connectivity and Motion Transport

### Smart Connect (Automatic Robot Discovery)

Desktop clients can't rely on the same-origin trick Cerebra uses, so PIB Connect
probes the local network in priority order:

1. `pib.local` over mDNS (works on most home networks out of the box)
2. The short hostname `pib` (Windows / NetBIOS / some routers)
3. The user's last-known saved IP for an instant reconnect

Result: most users never have to enter an IP address manually.

### Active Mainline Connectivity

- Configurable robot API IP and port (auto-populated by Smart Connect)
- Configurable ROSBridge WebSocket port
- Backend health test from settings
- Background health polling every 30 seconds
- Mock mode for testing without physical hardware
- Live motor updates sent through ROSBridge `/apply_joint_trajectory`
- Automatic ROSBridge reconnect behavior when the socket closes
- Vite dev proxy reconfiguration without restarting the dev server

### Execution Targets

| Target | Purpose | Safety Model |
| --- | --- | --- |
| Simulator | Default execution path for local validation | Default selected; no physical movement |
| Robot | Run on real hardware via pib-backend | Blocked when backend health is not connected |

### Technical Reserve: Tauri Serial Layer

The repository still contains a direct serial control path in Tauri:

- list serial ports
- connect and disconnect serial devices
- connect mock serial
- send single-motor and multi-motor goal-position packets
- Dynamixel-style packet generation in Rust

Current status:

- the Tauri command surface still exists in the repository
- this path is not the primary control surface in the current main app flow
- the product UX is centered on pib-backend REST plus ROSBridge

## 6. Programming Workspace

### Blockly Editor

- Embedded Blockly workspace with dark theme
- Automatic persistence of workspace JSON in the current project
- Automatic Python generation on workspace changes
- Standard Blockly categories for logic, math, text, and variables
- PIB-specific custom blocks for robot actions

### Custom PIB Blockly Blocks

| Block | Purpose | Generated Python |
| --- | --- | --- |
| `pib_move_to_pose` | Move to a saved pose by name | `pib.apply_pose("name")` |
| `pib_set_motor` | Set one motor to a 0 to 1023 value | `pib.set_motor("joint", value)` |
| `pib_wait` | Wait for a duration | `time.sleep(seconds)` |
| `pib_repeat` | Repeat a block chain | `for _i in range(n): ...` |
| `pib_print` | Print to the output console | `print(value)` |

### Python Editor

- Monaco-based Python editor
- Generated Blockly Python can be mirrored into the Python tab
- Direct editing of Python for advanced users
- Autosave of Python text in local storage
- Editor styling tuned for dark desktop use

### Embedded Documentation

The right-hand docs panel currently ships quick reference entries for:

- `fk(arm, angles)`
- `ik(arm, xyz)`
- `pib.set_motor(name, pos)`
- `pib.apply_pose(name)`
- `time.sleep(seconds)`
- `print(message)`

### Console and Output

- Docked output console for editor runs
- Auto-scroll while output changes
- Auto-expand when a program starts; minimizable header bar
- Combined display of simulator output and backend run output
- Clear output action after execution completes

## 7. Execution and Simulation

### Run Lifecycle

- Run and stop actions from the top bar and desktop menu
- Separate run flows for Blockly-generated Python and hand-written Python
- Real robot execution uploads code to pib-backend as a program and triggers
  backend execution
- Robot execution is blocked when backend status is not connected
- Output makes the current target explicit: simulator or robot

### Simulator Features

- Safe-by-default local execution target
- Blockly interpreter for linked top-level block chains
- Lightweight Python interpreter for a supported subset of PIB commands
- Start-position snapshot so stop can restore the pre-run pose
- Human-readable execution trace in the output console

### Supported Local Python Subset

| Statement | Supported |
| --- | --- |
| `pib.apply_pose("name")` | Yes |
| `pib.set_motor("name", value)` | Yes |
| `time.sleep(seconds)` | Yes |
| `print(...)` | Yes |
| `for x in range(n):` | Yes |
| Arbitrary Python runtime behavior | No |
| Imports beyond the expected PIB examples | Ignored locally |

### Execution Safety Rules

- Simulator is the default target
- Real-robot execution requires backend connectivity
- Stop restores the simulator state to the run starting position
- Local interpreters skip unrecognized Blockly-standard or Python lines instead
  of crashing the UI

## 8. AI Assistant and Chat

Now a first-class product surface, exposed via the AI tab.

### Chat Workspace

- Multi-session chat sidebar — create, switch, and delete conversations
- Streaming-style chat panel with markdown rendering (lists, code blocks,
  tables, links, blockquotes)
- Chat input with optional speech/voice controls and `SpeechIndicator` feedback
- Vision preview component for image-aware models — drop or paste an image and
  it's included with the next message

### Personality System

- Browse and select among shipped personalities
- Edit name, prompt/description, gender, language, and assigned model in a
  dedicated `PersonalityEditor` view
- Personalities are persisted per environment and apply across sessions

### Model Endpoints

| Endpoint | Notes |
| --- | --- |
| pib-backend | Default; routes through the connected robot's backend |
| TRYB | Managed cloud endpoint with token-aware request handling |
| Custom | User-supplied URL for self-hosted or proxied models |

- Vision-capable model indicators in the model picker
- Centralized AI token service (`aiTokenService`) handles credential storage and
  refresh for managed endpoints

## 9. Calibration

- Dedicated step-by-step calibration wizard
- Body-part progression: welcome, head, right arm, left arm, right hand, left hand, save
- Three-point capture per joint: min, neutral, max
- Live slider-based positioning while calibrating
- Pairing mode bypasses URDF joint limits so each motor can be driven to its
  physical zero independent of simulator pose constraints
- Import and export of complete motor-configuration snapshots: calibration data,
  joint-invert overrides, visual-offset overrides, and 180° half-turn flags —
  one portable JSON file
- Merge new calibration with existing calibration data before saving
- Load and reload calibration into robot control state without restarting the app
- One-click sync from robot motor settings by converting backend centidegree
  ranges into UI servo values

### Calibration UX Highlights

- Works across all 30 motors
- Shows live 3D preview while calibrating
- Displays capture completeness per joint
- Can be minimized while kept active

## 10. Project Persistence and Data Model

### `.pib` Project Schema

Current project files contain:

- `version`
- `name`
- `projectType`
- `createdAt`
- `updatedAt`
- `poses`
- `blocklyWorkspace`
- `pythonCode`

### Persistence Behavior

- New projects initialize with a template PIB Python script
- Projects can be saved to and loaded from disk
- Projects can also live in local storage for quick reopening
- Loaded projects restore Blockly workspace, Python code, and poses

### Local Storage Keys in Use

| Key | Purpose |
| --- | --- |
| `pib_project_list` | list of saved local projects |
| `pib_project_*` | per-project local backup |
| `pib_local_poses` | locally persisted poses |
| `pib_autosave_python` | autosaved Python editor content |
| `pibRobotIp` | robot backend IP (auto-filled by Smart Connect) |
| `pibRobotApiPort` | REST API port |
| `pibRosBridgePort` | ROSBridge port |
| `pibMockMode` | mock mode flag |
| `robotCalibration` | calibration data |
| `robotJointInvertOverrides` | per-joint INV flags |
| `robotJointVisualOffsetOverrides` | per-joint visual-offset overrides |
| `robotJointHalfTurnOverrides` | per-joint 180° half-turn overrides |
| `robotMotorRangeOverrides` | per-joint motor-range overrides |
| `pibApiDebug` | API debug logging flag |

## 11. Backend and API Surface Present in the Client

| Domain | Client Support | Main UI Exposure |
| --- | --- | --- |
| Motors | Yes | Yes |
| Poses | Yes | Yes |
| Programs | Yes | Yes |
| Health | Yes | Yes |
| Joint trajectory | Yes | Yes |
| Camera settings | Yes | Yes (Controls → Camera) |
| Chat | Yes | Yes (AI tab) |
| Personality | Yes | Yes (AI tab → personality editor) |
| Assistant model | Yes | Yes (AI tab → model picker) |
| Bricklets | Yes | Not exposed in primary UI |
| Host IP | Yes | Used internally by Smart Connect |

## 12. Settings, Debug, and About

Dedicated Settings window with the following tabs:

- **Connection** — API and ROSBridge configuration, Smart Connect status,
  backend health test
- **AI** — model endpoint selection, custom URL, API key management, default
  personality
- **Motor Controls** — per-joint min/neutral/max overrides, invert flags,
  half-turn flags, visual offsets, plus configuration import/export
- **Calibration** — launch the wizard, view per-joint coverage, import/export
  calibration snapshots
- **Debug** — joint list with motor IDs and current values, grouped by body part
- **About** — desktop-app summary and tech stack

## 13. Toast Notifications

A toast notification primitive surfaces feedback for connection events, robot
actions, calibration writes, and errors.

- Three tones: success (emerald), error (red), info (blue)
- Stacked in the top-right corner with backdrop blur
- Click-to-dismiss
- Enter and exit animations tuned to the global motion language
- Driven from any module via the `useToastStore` Zustand store

## 14. Design System and UI Primitives

The frontend uses a token-driven dark theme with a small set of shared primitives.

### Design Tokens (`src/index.css`)

- `--color-surface-{base,raised,overlay,hover}` — surface scale
- `--color-border-{subtle,default,strong}` — border weight scale
- `--color-text-{primary,secondary,tertiary,muted}` — text opacity scale
- `--color-accent-{green,blue,red,amber,cyan}` — accent palette

### Shared Components (`src/components/ui/`)

| Component | Purpose |
| --- | --- |
| `Button` | Standard rectangular button with primary/secondary/danger/ghost variants and four sizes |
| `IconButton` | Round icon button with `ghost`, `glass`, and `toggle-on` tones — used for floating 3D controls and top-bar toggles |
| `Navbar` | Sliding-pill tab navigation with measured indicator animation |
| `ToastContainer` | Top-right toast stack with auto-dismiss |

### Motion Language

- All durations between 150 and 250 ms for interactive UI
- Unified easing curve: `cubic-bezier(0.32, 0.72, 0, 1)` (the iOS drawer curve)
- Explicit `transition-[property]` lists — no `transition: all` anywhere
- `active:scale-[0.94–0.97]` calibrated to element size for press feedback
- `prefers-reduced-motion` honored globally
- `focus-visible` rings on every interactive element for keyboard accessibility

## 15. Desktop Integration (Tauri)

- Native desktop menus for file, view, program, settings, and help actions
- Keyboard shortcuts for common actions
- Native open/save dialogs
- Separate Tauri windows for project and settings flows
- Multi-platform release workflow with signed builds for macOS (Intel + Apple
  Silicon), Linux, and Windows

## 16. Known Gaps and Limitations

- The local simulator supports only a focused subset of Blockly and Python
  semantics, not a full Python runtime
- Bricklet APIs are present in code but not yet surfaced as primary product features
- The direct serial Tauri path exists, but the current app experience is
  optimized around pib-backend and ROSBridge
- No live motor-feedback loop is surfaced in the main UI (positions are
  synchronized via ROSBridge but no per-joint telemetry chart)
- No dedicated emergency-stop UX exists yet
- Health checking validates backend reachability, not full robot readiness
- URDF joint limits prevent single-axis intersections with the torso, but do
  not perform true mesh-level collision detection across all joint combinations

## 17. Recommended Next Documentation Links

- `docs/prd.md` for the product requirements view
- `docs/pib-backend-functionality.md` for backend capability overview
