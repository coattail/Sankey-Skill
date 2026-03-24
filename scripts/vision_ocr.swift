import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count >= 2 else {
  fputs("usage: vision_ocr.swift <image-path>\n", stderr)
  exit(1)
}

let imagePath = CommandLine.arguments[1]
let imageURL = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: imageURL) else {
  fputs("failed to load image\n", stderr)
  exit(1)
}

guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fputs("failed to create cgImage\n", stderr)
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
  try handler.perform([request])
  let observations = request.results ?? []
  for observation in observations {
    guard let candidate = observation.topCandidates(1).first else { continue }
    print(candidate.string)
  }
} catch {
  fputs("ocr error: \(error)\n", stderr)
  exit(1)
}
