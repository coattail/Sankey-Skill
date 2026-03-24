import Foundation
import Vision
import AppKit
import PDFKit

struct OCRObservation: Codable {
  let text: String
  let x: Double
  let y: Double
  let width: Double
  let height: Double
  let confidence: Double
}

guard CommandLine.arguments.count >= 2 else {
  fputs("usage: vision_ocr.swift [--json] <image-path> | --pdf <pdf-path> --page <n> [--json]\n", stderr)
  exit(1)
}

func recognizeObservations(from cgImage: CGImage) throws -> [OCRObservation] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  try handler.perform([request])
  let observations = request.results ?? []
  return observations.compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let box = observation.boundingBox
    return OCRObservation(
      text: candidate.string,
      x: Double(box.origin.x),
      y: Double(1.0 - box.origin.y - box.size.height),
      width: Double(box.size.width),
      height: Double(box.size.height),
      confidence: Double(candidate.confidence)
    )
  }
}

func cgImage(from imageURL: URL) -> CGImage? {
  guard let image = NSImage(contentsOf: imageURL) else {
    return nil
  }
  return image.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

func renderPDFPage(_ page: PDFPage, scale: CGFloat = 2.0) -> CGImage? {
  let bounds = page.bounds(for: .mediaBox)
  let size = CGSize(width: max(bounds.width * scale, 1), height: max(bounds.height * scale, 1))
  let image = page.thumbnail(of: size, for: .mediaBox)
  return image.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

let arguments = CommandLine.arguments
let wantsJSON = arguments.contains("--json")

func emit(_ observations: [OCRObservation], asJSON: Bool) {
  if asJSON {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    guard let data = try? encoder.encode(observations), let text = String(data: data, encoding: .utf8) else {
      fputs("failed to encode json\n", stderr)
      exit(1)
    }
    print(text)
    return
  }
  for observation in observations {
    print(observation.text)
  }
}

if arguments.contains("--pdf") {
  guard arguments.count >= 5 else {
    fputs("usage: vision_ocr.swift --pdf <pdf-path> --page <n> [--json]\n", stderr)
    exit(1)
  }
  guard
    let pdfIndex = arguments.firstIndex(of: "--pdf"),
    pdfIndex + 1 < arguments.count,
    let pageIndex = arguments.firstIndex(of: "--page"),
    pageIndex + 1 < arguments.count
  else {
    fputs("pdf mode requires --pdf <pdf-path> --page <n>\n", stderr)
    exit(1)
  }
  let pdfURL = URL(fileURLWithPath: arguments[pdfIndex + 1])
  guard let pageNumber = Int(arguments[pageIndex + 1]), pageNumber >= 1 else {
    fputs("pdf mode requires --page <n>\n", stderr)
    exit(1)
  }
  guard let document = PDFDocument(url: pdfURL) else {
    fputs("failed to load pdf\n", stderr)
    exit(1)
  }
  guard let page = document.page(at: pageNumber - 1) else {
    fputs("invalid pdf page\n", stderr)
    exit(1)
  }
  guard let cgImage = renderPDFPage(page) else {
    fputs("failed to render pdf page\n", stderr)
    exit(1)
  }
  do {
    emit(try recognizeObservations(from: cgImage), asJSON: wantsJSON)
  } catch {
    fputs("ocr error: \(error)\n", stderr)
    exit(1)
  }
} else {
  guard let imagePath = arguments.dropFirst().first(where: { !$0.hasPrefix("--") }) else {
    fputs("usage: vision_ocr.swift [--json] <image-path>\n", stderr)
    exit(1)
  }
  let imageURL = URL(fileURLWithPath: imagePath)
  guard let cgImage = cgImage(from: imageURL) else {
    fputs("failed to load image\n", stderr)
    exit(1)
  }
  do {
    emit(try recognizeObservations(from: cgImage), asJSON: wantsJSON)
  } catch {
    fputs("ocr error: \(error)\n", stderr)
    exit(1)
  }
}
