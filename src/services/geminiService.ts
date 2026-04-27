import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Question, QuestionType, QuizLevel } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateSpeech(text: string, voiceName: string = 'vi-VN-Standard-A'): Promise<string | null> {
  try {
    const googleTtsApiKey = import.meta.env.VITE_GOOGLE_TTS_API_KEY;
    
    if (googleTtsApiKey) {
      // Use Google Cloud Text-to-Speech API
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleTtsApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'vi-VN', name: voiceName }, 
          audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: 1.25 },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Google Cloud TTS Error:", errorData);
        return null;
      }

      const data = await response.json();
      return data.audioContent; // Trả về chuỗi base64
    }

    // Fallback to Gemini TTS if Google Cloud TTS API key is not provided
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

const SYSTEM_INSTRUCTION = `
Bạn là một chuyên gia về Giáo Lý Công Giáo, đặc biệt là tại Giáo phận Xuân Lộc.
Nhiệm vụ của bạn là tạo ra các câu hỏi ôn tập chất lượng cao cho các cấp độ khác nhau trong phong trào Thiếu Nhi Thánh Thể:
- Ấu nhi: Kiến thức cơ bản, đơn giản, dễ hiểu.
- Thiếu nhi: Kiến thức giáo lý căn bản, các câu chuyện Kinh Thánh.
- Nghĩa Sỹ: Kiến thức sâu hơn về giáo lý, luân lý và đời sống đức tin.
- Hiệp Sỹ: Kiến thức nâng cao, khả năng áp dụng đức tin vào đời sống xã hội.
- Huynh Trưởng: Kiến thức chuyên sâu về thần học, giáo lý, sư phạm giáo lý và lãnh đạo.

Dựa trên các chủ đề:
- Kinh Thánh Cựu Ước
- Kinh Thánh Tân Ước
- Giáo Lý Hội Thánh Công Giáo
- Quy chế Tổng quát Sách Lễ Rôma
- Các ngày lễ trong năm Phụng vụ
- Lịch Sử Giáo Hội
- Giáo Hội Việt Nam
- Các Thánh Tử Đạo Việt Nam
- Các Giáo Phận
- Giáo Phận Xuân Lộc
- Kinh Nguyện Kitô Giáo
- Phong trào Thiếu Nhi Thánh Thể

<context_usage>
Bạn sẽ nhận được danh sách các "Câu hỏi chưa biết" (người dùng đang gặp khó khăn hoặc muốn học thêm). 
Hãy sử dụng danh sách này để:
1. Hiểu trình độ và các mảng kiến thức người dùng đang quan tâm hoặc còn yếu.
2. Tạo ra các câu hỏi MỚI có liên quan hoặc giúp củng cố các mảng kiến thức đó.
3. Tuyệt đối không lặp lại y hệt các câu hỏi trong danh sách này.
</context_usage>

Bạn đã được cung cấp nội dung file câu hỏi năm 2024. Hãy dựa vào phong cách, độ khó và các chủ đề trong đó để tạo ra các câu hỏi MỚI, KHÔNG trùng lặp hoàn toàn với câu hỏi cũ nhưng vẫn bám sát chương trình và phù hợp với CẤP ĐỘ được yêu cầu.

<theological_rules>
1. TRÍCH DẪN BẮT BUỘC: Khi giải thích, luôn ưu tiên trích dẫn Kinh Thánh (Tên sách, chương, câu - in nghiêng) hoặc GLHTCG (Số khoản cụ thể). 
2. CHỐNG ẢO GIÁC (Zero Hallucination): Tuyệt đối trung thành với Tín lý Công giáo. Nếu không chắc chắn, hãy nói: "Tôi không có dữ liệu mạc khải về vấn đề này".
3. QUY TẮC DANH XƯNG: Khi nhắc đến tên riêng đã phiên âm (ưu tiên phiên âm Tiếng Việt theo bản dịch của nhóm Các Giờ Kinh Phụng Vụ), BẮT BUỘC kèm tên gốc tiếng Anh/Latinh. VD: Áp-ra-ham (Abraham), Giê-su (Jesus), Ét-te[tránh Ê-xơ-tê như Tin Lành] (Esther).
CHỈ kèm tên gốc với nội dung câu hỏi (đáp án thì TUYỆT ĐỐI KHÔNG THÊM).
4. CHẤM ĐIỂM VÀ GIẢI THÍCH: Đánh giá câu trả lời. Cung cấp đáp án đúng và trích dẫn nguồn Thần học cặn kẽ để giải thích.
5. THỨ TỰ THAM KHẢO ƯU TIÊN: 1. Kinh Thánh - 2. GLHTCG - 3. Các văn bản có tính minh bạch cao của Giáo Hội.
</theological_rules>

<formatting>
- In đậm, in nghiêng cho các từ cần thiết trong câu hỏi.
- Dùng Markdown linh hoạt (In đậm từ khóa, in nghiêng Lời Chúa).
- Dùng Bảng (Table) để so sánh các khái niệm (v.d: 7 Bí Tích).
- Dùng Blockquote (>) cho các định nghĩa chính thức từ GLHTCG.
</formatting>

Khi tạo câu hỏi trắc nghiệm (multiple-choice):
- Cung cấp 4 lựa chọn (A, B, C, D).
- Chỉ rõ đáp án đúng.
- Các đáp án sai PHẢI tương đồng với đáp án đúng, không xàm, ngô nghê, tránh việc quá dễ nhận biết đáp án đúng giữa 4 đáp án. 
- Các đáp án sai phải có đủ ý như đáp án đúng nhưng các ý khác đi.
- TUYỆT ĐỐI không để lộ đáp án đúng thông qua sự khác biệt về độ dài hay cách diễn đạt chi tiết.
- Cung cấp giải thích chi tiết, cụ thể theo các quy tắc trên (theology và format).

Khi tạo câu hỏi tự luận:
- Giống như những câu mức điểm 30 trong file 2024
- Tuyệt đối không phải dạng viết văn, phân tích,...
- Cung cấp đáp án mẫu/gợi ý.
- Tuyệt đối không hỏi nhiều ý trong 1 câu.
- Hỏi về những điều khó hơn hoặc những chi tiết nhỏ cụ thể hơn.
- Cung cấp giải thích chi tiết, cụ thể theo các quy tắc trên (theology và format).

Luôn trả về kết quả dưới dạng JSON.
`;

export async function generateQuestions(
  topic: string, 
  type: QuestionType, 
  count: number, 
  contextFileContent: string,
  level: QuizLevel,
  existingQuestions: Question[] = [],
  knownQuestions: Question[] = [],
  onProgress?: (count: number) => void,
  onPartialQuestions?: (questions: Question[]) => void
): Promise<{ questions: Question[], successMessage: string }> {
  const model = "gemini-3-flash-preview";
  
  const typeText = type === 'multiple-choice' 
    ? 'TRẮC NGHIỆM (có 4 lựa chọn A, B, C, D)' 
    : type === 'multiple-select'
      ? 'TRẮC NGHIỆM NHIỀU ĐÁP ÁN (có 4-6 lựa chọn, CÓ THỂ CÓ NHIỀU ĐÁP ÁN ĐÚNG)'
      : type === 'short-essay' 
        ? 'TỰ LUẬN NGẮN (câu hỏi tương tự trắc nghiệm nhưng không có các phương án lựa chọn, yêu cầu trả lời ngắn gọn)' 
        : 'TỰ LUẬN DÀI (như các câu khó trong file 2024, tuyệt đối không hỏi nhiều ý trong 1 câu, hỏi về những điều khó hơn hoặc những chi tiết nhỏ cụ thể hơn, câu trả lời không dài, không yêu cầu phân tích như viết văn)';

  const existingContext = existingQuestions.length > 0 
    ? `\nDANH SÁCH CÂU HỎI "CHƯA BIẾT" (Người dùng đang học, hãy dùng làm context để tạo câu hỏi liên quan hoặc củng cố kiến thức, tránh trùng lặp y hệt):\n${existingQuestions.map((q, i) => `${i+1}. ${q.question}`).join('\n')}`
    : '';

  const knownContext = knownQuestions.length > 0 
    ? `\nDANH SÁCH CÂU HỎI "ĐÃ BIẾT" (TUYỆT ĐỐI KHÔNG tạo lại các câu hỏi này):\n${knownQuestions.map((q, i) => `${i+1}. ${q.question}`).join('\n')}`
    : '';

  const prompt = `
Hãy tạo CHÍNH XÁC ${count} câu hỏi ${typeText} dành cho cấp độ: ${level}.
Chủ đề: ${topic}.

Dựa trên nội dung tham khảo từ năm 2024 sau đây:
---
${contextFileContent}
---
${existingContext}
${knownContext}

Yêu cầu: 
1. Các câu hỏi phải mới, TUYỆT ĐỐI không trùng lặp nội dung với danh sách câu hỏi đã có ở trên.
2. Giữ vững độ khó và phong cách Thần học của các câu hỏi mẫu nhưng phải PHÙ HỢP VỚI TRÌNH ĐỘ ${level}.
3. Nếu là TRẮC NGHIỆM hoặc TRẮC NGHIỆM NHIỀU ĐÁP ÁN: Bắt buộc phải có trường 'options' chứa các lựa chọn.
4. Nếu là TỰ LUẬN NGẮN hoặc TỰ LUẬN DÀI: Trường 'options' phải để trống hoặc null.
5. Trường 'type' trong JSON trả về phải là '${type}'.
`;

  const responseStream = await ai.models.generateContentStream({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                type: { type: Type.STRING },
                question: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "Chỉ dành cho trắc nghiệm. Mảng các chuỗi đáp án (VD: 'A. Đáp án 1', 'B. Đáp án 2', ...)."
                },
                correctAnswer: { 
                  type: Type.STRING,
                  description: "Dành cho trắc nghiệm 1 đáp án: BẮT BUỘC bắt đầu bằng ký tự A, B, C hoặc D (VD: 'A. Đáp án 1'). Dành cho trắc nghiệm nhiều đáp án: Liệt kê các đáp án đúng phân tách bằng dấu phẩy (VD: 'A, C' hoặc 'A. Đáp án 1, C. Đáp án 3'). Dành cho tự luận: Đáp án gợi ý."
                },
                explanation: { type: Type.STRING }
              },
              required: ["topic", "type", "question", "correctAnswer", "explanation"]
            }
          },
          successMessage: {
            type: Type.STRING,
            description: "Nội dung chúc mừng ngắn gọn (chỉ 1 câu). Sau đó gợi ý các chủ đề khác tương tự, tên các chủ đề phải được in đậm bằng Markdown (v.d: **Tên chủ đề**)."
          }
        },
        required: ["questions", "successMessage"]
      }
    }
  });

  let fullText = "";
  let generatedCount = 0;

  const parsePartialJsonArray = (jsonString: string): any[] => {
    try {
      return JSON.parse(jsonString).questions || [];
    } catch (e) {
      const startIndex = jsonString.indexOf('"questions"');
      if (startIndex === -1) return [];
      const arrayStart = jsonString.indexOf('[', startIndex);
      if (arrayStart === -1) return [];
      
      let arrayStr = jsonString.substring(arrayStart);
      for (let i = arrayStr.length; i > 0; i--) {
        if (arrayStr[i - 1] === '}') {
          try {
            const parsed = JSON.parse(arrayStr.substring(0, i) + ']');
            return parsed;
          } catch (err) {
            // Continue trying shorter strings
          }
        }
      }
      return [];
    }
  };

  for await (const chunk of responseStream) {
    if (chunk.text) {
      fullText += chunk.text;
      // Count occurrences of "explanation" to estimate completed questions
      const matches = fullText.match(/"explanation"\s*:/g);
      const currentCount = matches ? matches.length : 0;
      if (currentCount > generatedCount) {
        generatedCount = currentCount;
        if (onProgress) {
          onProgress(Math.min(generatedCount, count));
        }
        if (onPartialQuestions) {
          const partialQuestions = parsePartialJsonArray(fullText);
          if (partialQuestions.length > 0) {
            onPartialQuestions(partialQuestions.map((q: any) => ({ ...q, isNew: true })));
          }
        }
      }
    }
  }

  const result = JSON.parse(fullText || "{}");
  return {
    questions: (result.questions || []).map((q: any) => ({ ...q, isNew: true })),
    successMessage: result.successMessage || "Bạn đã hoàn thành xuất sắc bộ câu hỏi ôn tập này. Hãy tiếp tục cố gắng nhé!"
  };
}

export async function evaluateAllEssayAnswers(questionsAndAnswers: { question: string; correctAnswer: string; userAnswer: string }[]): Promise<{ score: number; feedback: string }[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
Dưới đây là danh sách các câu hỏi, đáp án mẫu và câu trả lời của người dùng:
${questionsAndAnswers.map((qa, index) => `
[Câu ${index + 1}]
Câu hỏi: ${qa.question}
Đáp án mẫu: ${qa.correctAnswer}
Câu trả lời của người dùng: ${qa.userAnswer}
`).join('\n')}

Hãy đánh giá TỪNG câu trả lời của người dùng dựa trên đáp án mẫu tương ứng.
Trả về một mảng JSON, mỗi phần tử chứa điểm số (0-10) và nhận xét chi tiết (feedback) cho câu hỏi tương ứng theo đúng thứ tự.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: `Bạn là một giám khảo chấm thi Giáo Lý. Hãy chấm điểm công tâm và đưa ra lời khuyên hữu ích.
      
<theological_rules>
1. TRÍCH DẪN BẮT BUỘC: Khi giải thích, luôn ưu tiên trích dẫn Kinh Thánh (Tên sách, chương, câu - in nghiêng) hoặc GLHTCG (Số khoản cụ thể). 
2. CHỐNG ẢO GIÁC (Zero Hallucination): Tuyệt đối trung thành với Tín lý Công giáo. Nếu không chắc chắn, hãy nói: "Tôi không có dữ liệu mạc khải về vấn đề này".
3. QUY TẮC DANH XƯNG: Khi nhắc đến tên riêng đã phiên âm, BẮT BUỘC kèm tên gốc tiếng Anh/Latinh. VD: Áp-ra-ham (Abraham), Giê-su (Jesus).
4. CHẤM ĐIỂM VÀ GIẢI THÍCH: Đánh giá câu trả lời. Cung cấp đáp án đúng và trích dẫn nguồn Thần học cặn kẽ để giải thích.
5. THỨ TỰ THAM KHẢO ƯU TIÊN: 1. Kinh Thánh - 2. GLHTCG - 3. Các văn bản có tính minh bạch cao của Giáo Hội.
</theological_rules>

<formatting>
- Dùng Markdown linh hoạt (In đậm từ khóa, in nghiêng Lời Chúa).
- Dùng Bảng (Table) để so sánh các khái niệm (v.d: 7 Bí Tích).
- Dùng Blockquote (>) cho các định nghĩa chính thức từ GLHTCG.
</formatting>`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING }
          },
          required: ["score", "feedback"]
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}
