import NetworkExtension
import SwiftUI
import UIKit

private let tunnelProviderBundleId = "com.animus.link.ios.tunnel"

private enum MobileTab: String, CaseIterable, Hashable {
    case onboarding = "Onboarding"
    case services = "Services"
    case tunnel = "Tunnel"
    case diagnostics = "Diagnostics"
    case settings = "Settings"
    case messenger = "Messenger"
}

@MainActor
final class MobileAppModel: ObservableObject {
    @Published var selectedTab: MobileTab = .onboarding

    @Published var appVersion: String = "loading"
    @Published var appStatus: String = "unknown"
    @Published var tunnelStatus: String = "stopped"
    @Published var errorText: String = ""

    @Published var daemonBaseURL: String = "http://127.0.0.1:9999"

    @Published var createdInviteRaw: String = ""
    @Published var createdInviteMasked: String = "none"
    @Published var inviteToJoin: String = ""
    @Published var onboardingMessage: String = ""

    @Published var serviceName: String = "echo"
    @Published var serviceLocalAddr: String = "127.0.0.1:7000"
    @Published var allowedPeersCsv: String = "peer-b"
    @Published var servicesMessage: String = ""

    @Published var gatewayService: String = "gateway-exit"
    @Published var relayAddr: String = "127.0.0.1:3478"
    @Published var relayToken: String = ""
    @Published var relayTtlSecs: String = "60"
    @Published var connId: String = String(Int(Date().timeIntervalSince1970))
    @Published var peerId: String = "ios-client"
    @Published var failMode: String = "open_fast"
    @Published var dnsMode: String = "remote_best_effort"
    @Published var protectedEndpoints: String = ""
    @Published var excludeCidrs: String = ""
    @Published var allowLan: Bool = false
    @Published var mtu: String = "1500"
    @Published var maxPacket: String = "2048"
    @Published var tunnelMessage: String = ""

    @Published var selfCheckText: String = "No data"
    @Published var diagnosticsText: String = "No data"
    @Published var reportMessage: String = ""

    @Published var showShareSheet: Bool = false
    @Published var shareBundleText: String = ""

    func refreshAll() {
        refreshCoreStatus()
        refreshTunnelState()
    }

    func refreshCoreStatus() {
        appVersion = version()
        let s = status()
        appStatus = "running=\(s.running) peers=\(s.peerCount) path=\(s.path)"
        errorText = ""
    }

    func createInvite() {
        let invite = inviteCreate()
        createdInviteRaw = invite
        createdInviteMasked = maskInvite(invite)
        onboardingMessage = "Invite created. Use copy to share securely."
    }

    func copyInvite() {
        guard !createdInviteRaw.isEmpty else {
            onboardingMessage = "No invite available."
            return
        }
        UIPasteboard.general.string = createdInviteRaw
        onboardingMessage = "Invite copied to clipboard."
    }

    func joinInvite() {
        let trimmed = inviteToJoin.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            onboardingMessage = "InvalidInput: invite is required"
            return
        }
        do {
            try inviteJoin(invite: trimmed)
            onboardingMessage = "Invite joined."
        } catch {
            onboardingMessage = formatError(error)
        }
    }

    func exposeService() {
        let peers = splitCsv(allowedPeersCsv)
        let body: [String: Any] = [
            "service_name": serviceName.trimmingCharacters(in: .whitespacesAndNewlines),
            "local_addr": serviceLocalAddr.trimmingCharacters(in: .whitespacesAndNewlines),
            "allowed_peers": peers,
        ]
        Task {
            servicesMessage = await request(path: "/v1/expose", method: "POST", body: body)
        }
    }

    func connectService() {
        let body: [String: Any] = [
            "service_name": serviceName.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        Task {
            servicesMessage = await request(path: "/v1/connect", method: "POST", body: body)
        }
    }

    func startTunnel() {
        guard validateTunnelInput() else {
            return
        }
        loadOrCreateManager { manager in
            do {
                try manager.connection.startVPNTunnel()
                DispatchQueue.main.async {
                    self.tunnelStatus = "connecting"
                    self.errorText = ""
                    self.tunnelMessage = "Tunnel enable requested."
                }
            } catch {
                DispatchQueue.main.async {
                    self.errorText = "StartTunnelError: \(error.localizedDescription)"
                    self.tunnelStatus = "error"
                    self.tunnelMessage = "Tunnel enable failed."
                }
            }
        }
    }

    func stopTunnel() {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            DispatchQueue.main.async {
                if let error {
                    self.errorText = "StopTunnelLoadError: \(error.localizedDescription)"
                    self.tunnelMessage = "Tunnel disable failed."
                    return
                }
                guard let manager = managers?.first else {
                    self.tunnelStatus = "stopped"
                    self.tunnelMessage = "Tunnel already stopped."
                    return
                }
                manager.connection.stopVPNTunnel()
                self.tunnelStatus = "stopped"
                self.errorText = ""
                self.tunnelMessage = "Tunnel stopped."
            }
        }
    }

    func refreshTunnelState() {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            DispatchQueue.main.async {
                if let error {
                    self.tunnelStatus = "error"
                    self.errorText = "TunnelLoadError: \(error.localizedDescription)"
                    return
                }
                guard let manager = managers?.first else {
                    self.tunnelStatus = "not_configured"
                    return
                }
                self.tunnelStatus = self.tunnelStatusLabel(manager.connection.status)
            }
        }
    }

    func fetchSelfCheck() {
        Task { selfCheckText = await request(path: "/v1/self_check", method: "GET", body: nil) }
    }

    func fetchDiagnostics() {
        Task { diagnosticsText = await request(path: "/v1/diagnostics", method: "GET", body: nil) }
    }

    func exportReport() {
        let bundle = [
            "Animus Link Diagnostics Report",
            "version=\(appVersion)",
            "status=\(appStatus)",
            "tunnel=\(tunnelStatus)",
            "self_check=\(redactSensitive(selfCheckText))",
            "diagnostics=\(redactSensitive(diagnosticsText))",
        ].joined(separator: "\n")
        shareBundleText = bundle
        showShareSheet = true
        reportMessage = "Diagnostics bundle prepared."
    }

    func relayTokenMasked() -> String {
        let trimmed = relayToken.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "none"
        }
        if trimmed.count <= 24 {
            return "****"
        }
        let head = String(trimmed.prefix(12))
        let tail = String(trimmed.suffix(6))
        return "\(head)…\(tail)"
    }

    private func validateTunnelInput() -> Bool {
        guard Int(relayTtlSecs) != nil,
              UInt64(connId) != nil,
              Int(mtu) != nil,
              Int(maxPacket) != nil
        else {
            tunnelMessage = "InvalidInput: tunnel numeric fields are invalid"
            return false
        }
        tunnelMessage = "Policy: fail=\(failMode) dns=\(dnsMode) allow_lan=\(allowLan)"
        return true
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

    private func splitCsv(_ raw: String) -> [String] {
        raw
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private func request(path: String, method: String, body: [String: Any]?) async -> String {
        guard let url = URL(string: daemonBaseURL.trimmingCharacters(in: .whitespacesAndNewlines) + path) else {
            return "InvalidInput: bad daemon URL"
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 1.2
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let payload = String(data: data, encoding: .utf8) ?? ""
            return redactSensitive("HTTP \(status)\n\(payload)")
        } catch {
            return formatError(error)
        }
    }

    private func formatError(_ error: Error) -> String {
        let type = String(describing: Swift.type(of: error))
        let message = String(describing: error)
        return redactSensitive("\(type): \(message)")
    }
}

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = MobileAppModel()

    private let radius = radiusFromToken()

    var body: some View {
        TabView(selection: $model.selectedTab) {
            shell {
                OnboardingView(model: model, radius: radius)
            }
            .tag(MobileTab.onboarding)
            .tabItem { Label(MobileTab.onboarding.rawValue, systemImage: "person.badge.plus") }

            shell {
                ServicesView(model: model, radius: radius)
            }
            .tag(MobileTab.services)
            .tabItem { Label(MobileTab.services.rawValue, systemImage: "square.stack.3d.up") }

            shell {
                TunnelView(model: model, radius: radius)
            }
            .tag(MobileTab.tunnel)
            .tabItem { Label(MobileTab.tunnel.rawValue, systemImage: "cable.connector") }

            shell {
                DiagnosticsView(model: model, radius: radius)
            }
            .tag(MobileTab.diagnostics)
            .tabItem { Label(MobileTab.diagnostics.rawValue, systemImage: "stethoscope") }

            shell {
                SettingsView(model: model, radius: radius)
            }
            .tag(MobileTab.settings)
            .tabItem { Label(MobileTab.settings.rawValue, systemImage: "gearshape") }

            shell {
                MessengerView(radius: radius)
            }
            .tag(MobileTab.messenger)
            .tabItem { Label(MobileTab.messenger.rawValue, systemImage: "message") }
        }
        .tint(AnimusTheme.primary)
        .background(AnimusTheme.background.ignoresSafeArea())
        .onAppear { model.refreshAll() }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                model.refreshAll()
            }
        }
        .sheet(isPresented: $model.showShareSheet) {
            ActivityView(activityItems: [model.shareBundleText])
        }
    }

    private func shell<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Card(radius: radius) {
                    Text("Animus Link")
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(AnimusTheme.foreground)
                    Text("Foreground-only (Public Beta)")
                        .font(.system(.caption, design: .rounded))
                        .fontWeight(.semibold)
                        .foregroundStyle(AnimusTheme.accent)
                    runtimeLine("Version", model.appVersion)
                    runtimeLine("Status", model.appStatus)
                    runtimeLine("Tunnel", model.tunnelStatus)
                    if !model.errorText.isEmpty {
                        Text(model.errorText)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(AnimusTheme.destructive)
                    }
                }
                content()
            }
            .padding(14)
        }
        .background(AnimusTheme.background.ignoresSafeArea())
    }

    private func runtimeLine(_ label: String, _ value: String) -> some View {
        Text("\(label): \(value)")
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(AnimusTheme.mutedForeground)
    }
}

private struct OnboardingView: View {
    @ObservedObject var model: MobileAppModel
    let radius: CGFloat

    var body: some View {
        Card(radius: radius) {
            SectionHeader(
                title: "Invite-first onboarding",
                subtitle: "Create, copy, and join without exposing secrets in UI logs."
            )
            HStack(spacing: 8) {
                PrimaryButton("Create invite") { model.createInvite() }
                SecondaryButton("Copy invite", enabled: !model.createdInviteRaw.isEmpty) { model.copyInvite() }
            }
            StatusBlock(label: "Masked invite", value: model.createdInviteMasked, accent: true, radius: radius)
            LabeledTextField(label: "Join invite", value: $model.inviteToJoin, radius: radius)
            PrimaryButton("Join network") { model.joinInvite() }
            MutedText(redactSensitive(model.onboardingMessage))
        }
    }
}

private struct ServicesView: View {
    @ObservedObject var model: MobileAppModel
    let radius: CGFloat

    var body: some View {
        Card(radius: radius) {
            SectionHeader(
                title: "Service Bridge",
                subtitle: "Expose local TCP services and connect to remote peers."
            )
            LabeledTextField(label: "Service name", value: $model.serviceName, radius: radius)
            LabeledTextField(label: "Local addr (expose)", value: $model.serviceLocalAddr, radius: radius)
            LabeledTextField(label: "Allowed peers csv", value: $model.allowedPeersCsv, radius: radius)
            HStack(spacing: 8) {
                PrimaryButton("Expose") { model.exposeService() }
                SecondaryButton("Connect") { model.connectService() }
            }
            StatusBlock(label: "Response", value: redactSensitive(model.servicesMessage), accent: false, radius: radius)
        }
    }
}

private struct TunnelView: View {
    @ObservedObject var model: MobileAppModel
    let radius: CGFloat

    var body: some View {
        Card(radius: radius) {
            SectionHeader(
                title: "Gateway Tunnel",
                subtitle: "Packet Tunnel extension control with relay policy form for parity."
            )
            LabeledTextField(label: "Gateway service", value: $model.gatewayService, radius: radius)
            LabeledTextField(label: "Relay addr host:port", value: $model.relayAddr, radius: radius)
            LabeledSecureField(label: "Signed relay token", value: $model.relayToken, radius: radius)
            MutedText("Token preview: \(model.relayTokenMasked())")
            HStack(spacing: 8) {
                LabeledTextField(label: "TTL", value: $model.relayTtlSecs, radius: radius)
                LabeledTextField(label: "Conn ID", value: $model.connId, radius: radius)
            }
            LabeledTextField(label: "Peer ID", value: $model.peerId, radius: radius)
            LabeledTextField(label: "Protected endpoints csv", value: $model.protectedEndpoints, radius: radius)
            LabeledTextField(label: "Exclude CIDRs csv", value: $model.excludeCidrs, radius: radius)
            HStack(spacing: 8) {
                LabeledTextField(label: "MTU", value: $model.mtu, radius: radius)
                LabeledTextField(label: "Max packet", value: $model.maxPacket, radius: radius)
            }
            Toggle("Allow LAN outside tunnel", isOn: $model.allowLan)
                .toggleStyle(.switch)
                .tint(AnimusTheme.primary)
                .foregroundStyle(AnimusTheme.mutedForeground)

            LabeledPicker(
                label: "Fail mode",
                selection: $model.failMode,
                values: ["open_fast", "closed"]
            )
            LabeledPicker(
                label: "DNS mode",
                selection: $model.dnsMode,
                values: ["remote_best_effort", "remote_strict", "system"]
            )

            HStack(spacing: 8) {
                PrimaryButton("Enable") { model.startTunnel() }
                SecondaryButton("Disable") { model.stopTunnel() }
                SecondaryButton("Status") { model.refreshTunnelState() }
            }
            StatusBlock(label: "Tunnel", value: model.tunnelStatus, accent: true, radius: radius)
            MutedText(redactSensitive(model.tunnelMessage))
            MutedText("Tunnel runs through extension controls while app is foreground in beta.")
        }
    }
}

private struct DiagnosticsView: View {
    @ObservedObject var model: MobileAppModel
    let radius: CGFloat

    var body: some View {
        Card(radius: radius) {
            SectionHeader(
                title: "Diagnostics",
                subtitle: "Read self_check and diagnostics, then export a redacted problem report."
            )
            HStack(spacing: 8) {
                PrimaryButton("Load self_check") { model.fetchSelfCheck() }
                SecondaryButton("Load diagnostics") { model.fetchDiagnostics() }
            }
            SecondaryButton("Report a problem") { model.exportReport() }
            StatusBlock(label: "Self check", value: redactSensitive(model.selfCheckText), accent: false, radius: radius)
            StatusBlock(label: "Diagnostics", value: redactSensitive(model.diagnosticsText), accent: false, radius: radius)
            if !model.reportMessage.isEmpty {
                Text(redactSensitive(model.reportMessage))
                    .font(.caption)
                    .foregroundStyle(AnimusTheme.accent)
            }
        }
    }
}

private struct SettingsView: View {
    @ObservedObject var model: MobileAppModel
    let radius: CGFloat

    var body: some View {
        Card(radius: radius) {
            SectionHeader(
                title: "Settings",
                subtitle: "Runtime refresh and generated token semantics."
            )
            LabeledTextField(label: "Local API base URL", value: $model.daemonBaseURL, radius: radius)
            HStack(spacing: 8) {
                PrimaryButton("Refresh runtime") { model.refreshAll() }
                SecondaryButton("Tunnel status") { model.refreshTunnelState() }
            }
            MutedText("Theme semantics: background/primary/accent from generated tokens.")
            Text("bg=\(String(describing: AnimusTheme.background)) primary=\(String(describing: AnimusTheme.primary)) accent=\(String(describing: AnimusTheme.accent))")
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(AnimusTheme.mutedForeground)
            Text("fonts=\(AnimusTheme.fontSans) | \(AnimusTheme.fontMono)")
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(AnimusTheme.mutedForeground)
        }
    }
}

private struct MessengerView: View {
    let radius: CGFloat

    var body: some View {
        Card(radius: radius) {
            SectionHeader(
                title: "Messenger",
                subtitle: "Placeholder for invite-scoped realtime messaging."
            )
            MutedText("Transport remains protocol-layer E2E. Payload logging is disabled.")
            Text("No message payloads are logged.")
                .font(.caption)
                .foregroundStyle(AnimusTheme.accent)
        }
    }
}

private struct Card<Content: View>: View {
    let radius: CGFloat
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            content
        }
        .padding(12)
        .background(AnimusTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .stroke(AnimusTheme.border.opacity(0.65), lineWidth: 1)
        )
    }
}

private struct SectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(AnimusTheme.foreground)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(AnimusTheme.mutedForeground)
        }
    }
}

private struct PrimaryButton: View {
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    init(_ title: String, enabled: Bool = true, action: @escaping () -> Void) {
        self.title = title
        self.enabled = enabled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(.callout, design: .rounded))
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .background(enabled ? AnimusTheme.primary : AnimusTheme.muted)
        .foregroundStyle(enabled ? AnimusTheme.primaryForeground : AnimusTheme.mutedForeground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .disabled(!enabled)
    }
}

private struct SecondaryButton: View {
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    init(_ title: String, enabled: Bool = true, action: @escaping () -> Void) {
        self.title = title
        self.enabled = enabled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(.callout, design: .rounded))
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .background(enabled ? AnimusTheme.secondary : AnimusTheme.muted)
        .foregroundStyle(enabled ? AnimusTheme.secondaryForeground : AnimusTheme.mutedForeground)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .disabled(!enabled)
    }
}

private struct LabeledTextField: View {
    let label: String
    @Binding var value: String
    let radius: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(AnimusTheme.mutedForeground)
            TextField(label, text: $value)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(10)
                .background(AnimusTheme.input.opacity(0.35))
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .foregroundStyle(AnimusTheme.foreground)
        }
    }
}

private struct LabeledSecureField: View {
    let label: String
    @Binding var value: String
    let radius: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(AnimusTheme.mutedForeground)
            SecureField(label, text: $value)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(10)
                .background(AnimusTheme.input.opacity(0.35))
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .foregroundStyle(AnimusTheme.foreground)
        }
    }
}

private struct LabeledPicker: View {
    let label: String
    @Binding var selection: String
    let values: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(AnimusTheme.mutedForeground)
            Picker(label, selection: $selection) {
                ForEach(values, id: \.self) { item in
                    Text(item).tag(item)
                }
            }
            .pickerStyle(.segmented)
        }
    }
}

private struct StatusBlock: View {
    let label: String
    let value: String
    let accent: Bool
    let radius: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(AnimusTheme.foreground)
            Text(value)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(accent ? AnimusTheme.accent : AnimusTheme.mutedForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .background((accent ? AnimusTheme.accent : AnimusTheme.input).opacity(0.16))
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

private struct MutedText: View {
    let value: String

    init(_ value: String) {
        self.value = value
    }

    var body: some View {
        Text(value)
            .font(.caption)
            .foregroundStyle(AnimusTheme.mutedForeground)
    }
}

private struct ActivityView: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private func maskInvite(_ invite: String) -> String {
    let trimmed = invite.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
        return "(empty)"
    }
    if trimmed.count <= 24 {
        return "****"
    }
    let head = String(trimmed.prefix(18))
    let tail = String(trimmed.suffix(6))
    return "\(head)…\(tail)"
}

private func redactSensitive(_ value: String) -> String {
    var redacted = value
    redacted = redacted.replacingOccurrences(
        of: #"animus://invite/[^\s"']+"#,
        with: "animus://invite/[redacted]",
        options: .regularExpression
    )
    redacted = redacted.replacingOccurrences(
        of: #"animus://rtok/[^\s"']+"#,
        with: "animus://rtok/[redacted]",
        options: .regularExpression
    )
    return redacted
}

private func radiusFromToken() -> CGFloat {
    let raw = AnimusTheme.radiusRadius.lowercased()
    guard raw.hasSuffix("rem"),
          let rem = Double(raw.replacingOccurrences(of: "rem", with: "").trimmingCharacters(in: .whitespaces))
    else {
        return 13.0
    }
    return CGFloat(max(4.0, min(28.0, rem * 16.0)))
}

#Preview {
    ContentView()
}
