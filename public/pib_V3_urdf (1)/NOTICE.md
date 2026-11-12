# pib 3D model: notice

The robot model in this folder (`robot.urdf` and the STL meshes in `protos/resources/`) is the
3D model of the **pib** open-source humanoid robot by **[pib.rocks](https://pib.rocks)**
(<https://github.com/pib-rocks>). It is not part of PIB Connect's own code and is **not** covered
by the MIT license of this repository.

pib.rocks publishes its robot models and software under the GNU Affero General Public License v3.0
(AGPL-3.0) or GPL-3.0 (see for example <https://github.com/pib-rocks/pib-3d> and
<https://github.com/pib-rocks/pib-stls>). The model files here are redistributed under
AGPL-3.0; the license text is in [`LICENSE`](LICENSE). If you change these files and distribute
them, the same license applies to your changes.

The model is loaded at runtime as data (URDF + meshes) by the app. Credit for the robot design
goes to pib.rocks and its contributors.
