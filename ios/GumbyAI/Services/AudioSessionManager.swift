import AVFoundation

/// Centralizes the one audio-session tweak that lets our videos play sound
/// even when the phone's ring/silent switch is set to silent — the same
/// behavior every other video app (TikTok, Instagram, YouTube) has.
///
/// The default audio session category is `.ambient`/`.soloAmbient`, which
/// the hardware mute switch silences. `.playback` is explicitly NOT
/// silenced by that switch. We only flip to `.playback` the moment the user
/// asks for sound (taps unmute / opens a result with audio), so a muted
/// autoplaying grid never grabs the audio focus.
enum AudioSessionManager {
    private static var configured = false

    static func enablePlaybackOverSilentSwitch() {
        let session = AVAudioSession.sharedInstance()
        do {
            // `.moviePlayback` mode + `.playback` category is the standard
            // combo for muted-by-default video that can be unmuted.
            try session.setCategory(.playback, mode: .moviePlayback, options: [])
            try session.setActive(true)
            configured = true
        } catch {
            // Non-fatal — if this fails the video simply keeps the system's
            // default (silent-switch-respecting) behavior.
            print("[AudioSession] enablePlayback failed: \(error.localizedDescription)")
        }
    }
}
