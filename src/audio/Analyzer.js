export class AudioAnalyzerHelper {
    // Utility for more advanced onset detection if needed
    static isOnset(value, threshold = 0.8) {
        return value > threshold;
    }
}
