# PIB Backend Functionality

The PIB backend provides the following functionalities:

## Key Features

1. **Motor Control**
   - Control and configure robot motors.
   - Set motor positions (0-1023 range).
   - Retrieve motor status and diagnostics.

2. **Pose Management**
   - Save and load robot poses.
   - Manage predefined poses for the robot.

3. **Bricklet Configuration**
   - Configure and manage connected bricklets.

4. **Voice Assistant and Chat**
   - Integrate with a voice assistant for voice commands.
   - Chat functionality for interacting with the robot.

5. **Program Execution**
   - Execute predefined robot programs.
   - Manage program execution states.

6. **Camera Settings**
   - Configure and manage camera settings.

## Communication

The frontend communicates with the backend via a REST API. The backend should be running on a server and accessible via a URL. The frontend application can be configured to use the backend by specifying the base URL and port.

### Example Configuration

To configure the frontend to communicate with the backend, update the base URL in the application configuration. For example:

```typescript
const BASE_URL = "http://<backend-server-ip>:<port>";
```

Replace `<backend-server-ip>` with the IP address or domain of the server where the backend is running, and `<port>` with the port number on which the backend is listening.

### API Endpoints

Refer to the `pib-api.yaml` file in the `pib-backend-main` folder for detailed API documentation, including available endpoints, request/response formats, and authentication details.

## Deployment

The backend can be deployed using Docker. Use the `docker-compose.yaml` file in the `pib-backend-main` folder to set up and run the backend services. Ensure that the backend is accessible from the network where the frontend application is running.

---

For further details, refer to the `README.md` file in the `pib-backend-main` folder or contact the backend team.