import { describe, expect, it } from 'vitest';
import { buildExtractionRequest, DEFAULT_MODEL, parseExtraction } from './ai-import';

describe('buildExtractionRequest', () => {
  it('builds a text-only request with the default model and a system prompt', () => {
    const req = buildExtractionRequest({ text: 'salary 95000' }) as { model: string; system: string; messages: { content: { type: string }[] }[] };
    expect(req.model).toBe(DEFAULT_MODEL);
    expect(req.system).toContain('JSON');
    const content = req.messages[0].content;
    expect(content.some((c) => c.type === 'text')).toBe(true);
    expect(content.some((c) => c.type === 'image')).toBe(false);
  });

  it('includes a base64 image block (vision) when an image data URL is given', () => {
    const req = buildExtractionRequest({ imageDataUrl: 'data:image/jpeg;base64,QUJD' }) as { messages: { content: { type: string; source?: { media_type: string; data: string } }[] }[] };
    const img = req.messages[0].content.find((c) => c.type === 'image');
    expect(img?.source?.media_type).toBe('image/jpeg');
    expect(img?.source?.data).toBe('QUJD');
  });
});

describe('parseExtraction', () => {
  it('parses a clean JSON object of in-range fields', () => {
    const out = parseExtraction('{"birthYear":1968,"province":"ON","bestFiveSalary":96000,"serviceYears":29,"retireAge":61,"cppAt65":1433,"rrsp":420000,"tfsa":88000,"nonReg":50000,"ownsHome":true,"homeValue":720000,"hasSpouse":false}');
    expect(out).toEqual({ birthYear: 1968, province: 'ON', bestFiveSalary: 96000, serviceYears: 29, retireAge: 61, cppAt65: 1433, rrsp: 420000, tfsa: 88000, nonReg: 50000, ownsHome: true, homeValue: 720000, hasSpouse: false });
  });

  it('tolerates markdown fences / surrounding prose', () => {
    const out = parseExtraction('Here is what I found:\n```json\n{ "cppAt65": 1250, "province": "bc" }\n```\nHope that helps!');
    expect(out.cppAt65).toBe(1250);
    expect(out.province).toBe('BC'); // upper-cased + validated
  });

  it('drops out-of-range and invalid values (no silent garbage)', () => {
    const out = parseExtraction('{"birthYear":1750,"retireAge":99,"cppAt65":999999,"province":"ZZ","bestFiveSalary":95000}');
    expect(out.birthYear).toBeUndefined();
    expect(out.retireAge).toBeUndefined();
    expect(out.cppAt65).toBeUndefined();
    expect(out.province).toBeUndefined();
    expect(out.bestFiveSalary).toBe(95000); // the one sane field survives
  });

  it('rounds fractional dollar/age fields and keeps fractional service years', () => {
    const out = parseExtraction('{"cppAt65":1433.6,"serviceYears":28.5,"rrsp":350000.4}');
    expect(out.cppAt65).toBe(1434);
    expect(out.serviceYears).toBe(28.5);
    expect(out.rrsp).toBe(350000);
  });

  it('returns {} on non-JSON without throwing', () => {
    expect(parseExtraction('I could not read the document.')).toEqual({});
  });
});
