import Foundation
import Vision

struct FrameInput: Decodable {
    let path: String
    let timeMs: Int
    let sourceTimeMs: Int
}
struct TextLine: Codable {
    let text: String
    let confidence: Float
    let box: [Double]
}
struct FrameResult: Codable {
    let frame: String
    let timeMs: Int
    let sourceTimeMs: Int
    let lines: [TextLine]
    let error: String?
}

guard CommandLine.arguments.count == 3 else {
    fputs("Usage: swift ocr.swift frames.json ocr.json\n", stderr)
    exit(2)
}
let indexFile = URL(fileURLWithPath: CommandLine.arguments[1])
let outputFile = URL(fileURLWithPath: CommandLine.arguments[2])
let frames = try JSONDecoder().decode([FrameInput].self, from: Data(contentsOf: indexFile))
var results: [FrameResult] = []
for (index, frame) in frames.enumerated() {
    let url = indexFile.deletingLastPathComponent().appendingPathComponent(frame.path)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    request.usesLanguageCorrection = true
    do {
        try VNImageRequestHandler(url: url).perform([request])
        let lines = (request.results ?? []).compactMap { observation -> TextLine? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            let box = observation.boundingBox
            return TextLine(text: candidate.string, confidence: candidate.confidence,
                            box: [box.minX, box.minY, box.width, box.height])
        }
        results.append(FrameResult(frame: frame.path, timeMs: frame.timeMs, sourceTimeMs: frame.sourceTimeMs, lines: lines, error: nil))
    } catch {
        results.append(FrameResult(frame: frame.path, timeMs: frame.timeMs, sourceTimeMs: frame.sourceTimeMs, lines: [], error: String(describing: error)))
    }
    if index % 25 == 0 { fputs("OCR \(index + 1)/\(frames.count)\n", stderr) }
}
try JSONEncoder().encode(results).write(to: outputFile, options: .atomic)
if results.contains(where: { $0.error != nil }) { exit(1) }
