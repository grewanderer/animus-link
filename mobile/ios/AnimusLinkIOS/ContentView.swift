import NetworkExtension
import SwiftUI

private let tunnelProviderBundleId = "com.animus.link.ios.tunnel"

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var versionText: String = "loading"
    @State private var statusText: String = "unknown"
    @State private var tunnelText: String = "stopped"
    @State private var errorText: String?

    var body: some View {
        VStack(spacing: 12) {
            Text("Animus Link iOS")
                .font(.title2)
            Text("Foreground-only (Public Beta)")
                .font(.caption)
                .foregroundColor(.secondary)

            Text("Version: \(versionText)")
                .font(.body)
                .foregroundColor(.secondary)
            Text("Status: \(statusText)")
                .font(.body)
                .foregroundColor(.secondary)
            Text("Tunnel: \(tunnelText)")
                .font(.body)
                .foregroundColor(.secondary)

            HStack(spacing: 12) {
                Button("Start Tunnel") {
                    startTunnel()
                }
                Button("Stop Tunnel") {
                    stopTunnel()
                }
            }
            .buttonStyle(.borderedProminent)

            if let errorText {
                Text(errorText)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(20)
        .onAppear {
            refreshStatus()
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                refreshStatus()
            }
        }
    }

    private func refreshStatus() {
        do {
            versionText = version()
            statusText = "\(status())"
            refreshTunnelState()
            errorText = nil
        } catch {
            let type = String(describing: Swift.type(of: error))
            let message = "\(error)"
            errorText = "\(type): \(message)"
        }
    }

    private func refreshTunnelState() {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            DispatchQueue.main.async {
                if let error {
                    self.tunnelText = "error"
                    self.errorText = "TunnelLoadError: \(error.localizedDescription)"
                    return
                }
                guard let manager = managers?.first else {
                    self.tunnelText = "not_configured"
                    return
                }
                let state = manager.connection.status
                self.tunnelText = tunnelStatusLabel(state)
            }
        }
    }

    private func startTunnel() {
        loadOrCreateManager { manager in
            do {
                try manager.connection.startVPNTunnel()
                DispatchQueue.main.async {
                    self.tunnelText = "connecting"
                    self.errorText = nil
                }
            } catch {
                DispatchQueue.main.async {
                    self.errorText = "StartTunnelError: \(error.localizedDescription)"
                    self.tunnelText = "error"
                }
            }
        }
    }

    private func stopTunnel() {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            DispatchQueue.main.async {
                if let error {
                    self.errorText = "StopTunnelLoadError: \(error.localizedDescription)"
                    return
                }
                guard let manager = managers?.first else {
                    self.tunnelText = "stopped"
                    return
                }
                manager.connection.stopVPNTunnel()
                self.tunnelText = "stopped"
                self.errorText = nil
            }
        }
    }

    private func loadOrCreateManager(completion: @escaping (NETunnelProviderManager) -> Void) {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error {
                DispatchQueue.main.async {
                    self.errorText = "TunnelManagerLoadError: \(error.localizedDescription)"
                }
                return
            }

            let manager = managers?.first ?? NETunnelProviderManager()
            let proto = NETunnelProviderProtocol()
            proto.providerBundleIdentifier = tunnelProviderBundleId
            proto.serverAddress = "animus-link-relay-first"
            manager.protocolConfiguration = proto
            manager.localizedDescription = "Animus Link Tunnel"
            manager.isEnabled = true

            manager.saveToPreferences { saveError in
                if let saveError {
                    DispatchQueue.main.async {
                        self.errorText = "TunnelManagerSaveError: \(saveError.localizedDescription)"
                    }
                    return
                }
                manager.loadFromPreferences { loadError in
                    if let loadError {
                        DispatchQueue.main.async {
                            self.errorText = "TunnelManagerReloadError: \(loadError.localizedDescription)"
                        }
                        return
                    }
                    completion(manager)
                }
            }
        }
    }

    private func tunnelStatusLabel(_ status: NEVPNStatus) -> String {
        switch status {
        case .invalid:
            return "invalid"
        case .disconnected:
            return "disconnected"
        case .connecting:
            return "connecting"
        case .connected:
            return "connected"
        case .reasserting:
            return "reasserting"
        case .disconnecting:
            return "disconnecting"
        @unknown default:
            return "unknown"
        }
    }
}

#Preview {
    ContentView()
}
