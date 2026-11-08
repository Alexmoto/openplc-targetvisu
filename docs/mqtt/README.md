# MQTT data source (experimental v1)

Developed on `feature/mqtt-data-source`, based on `develop`; production `main`
is unchanged. Requires the same feature branch of `Alexmoto/openplc-runtime`.

Open **Remote Devices → MQTT** in the project tree, enable the connection, and add mappings between
exact topics and named PLC variables. **Apply**, then **Save All**, compile and
upload the project. The compiler includes `conf/mqtt.json` only when enabled,
with variable addresses resolved against the current compiled debug map.
MQTT is currently a **single project-scoped broker connection** shown under
Remote Devices, not a separately named Modbus/EtherCAT-style remote device.
Existing `project.json` MQTT settings are unchanged by the navigation move;
no Runtime migration or update is required.

- Subscribe: receive JSON scalar values or select a field using JSON Pointer.
- Publish: send a scalar variable using a per-binding mode: `Interval` (optional
  per-row 100..60000 ms, default to the global publish interval) or `On change`
  (current value on connect/reconnect, then only when changed, sampled ~50 ms).
  QoS and retain remain per binding. Old projects default to periodic publishing.
- Broker host/port, client ID, username/password, TLS and optional Runtime CA path.
- BOOL and numeric scalars. Use non-constant, unlocated variables for subscriptions;
  do not assign those variables from ST if they must retain received values.
- MQTT is supported only on Runtime v4. Strings, structures, wildcard topics,
  per-variable timeout/quality and event/command queues are outside this first version.
- Connection loss preserves the last input value. The PLC can still overwrite a
  subscribed value. MQTT retained messages are accepted on reconnect.
- Credentials are saved in project.json and uploaded; keep real credentials out
  of public repositories. Leave the CA file empty for system trust, or enter an
  absolute path on the Runtime. TLS verifies the server certificate and hostname.

Example: declare `MqttTemperature : REAL` as a global variable without a location.
Map Subscribe `plant/sensor/temperature` to `MqttTemperature`, JSON pointer empty.
Send payload `23.5`. The value appears in Debugger and any TargetVisu element bound
to that variable. For `{"temperature":23.5}` use pointer `/temperature` instead.
Map a different output topic to a variable updated by the PLC to test publication.

Rebuild a Windows executable folder after switching to the feature branch:

```bat
npm run build
npx electron-builder --win --x64 --dir --publish never
```

Keep the entire `release\build\win-unpacked` folder. Runtime installation,
protocol behaviour and the manual acceptance checklist are documented in
[Runtime MQTT instructions](https://github.com/Alexmoto/openplc-runtime/blob/feature/mqtt-data-source/docs/MQTT.md).

Automated tests cover configuration, compiler validation, dialog Apply/Cancel,
project save/reload, and the Runtime's actual MQTT exchange with a local broker.
Windows packaging and a live Banana Pi/PLC run must still be tested before merging
this feature into production.
