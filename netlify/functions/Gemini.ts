import BaseModel from './BaseModel';
import speech from '@google-cloud/speech';
import vision from '@google-cloud/vision';

export default class Gemini extends BaseModel {
  speechClient: any;
  visionClient: any;

  constructor(requestModel: string, requestAuthorization: string, requestMessages: any) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${
      requestModel === "gemini" ? "gemini-pro" : requestModel
    }:generateContent?key=${requestAuthorization.replace('Bearer ', '')}`;
    super(requestModel, requestAuthorization, requestMessages, url);

    // 初始化 Google Cloud Speech 和 Vision 客户端
    this.speechClient = new speech.SpeechClient();
    this.visionClient = new vision.ImageAnnotatorClient();
  }

  protected formatHeaders() {
    if (!this.headers) {
      this.headers = { 'Content-Type': 'application/json' };
    }
  }

  /**
   * 修改后的 formatBody 方法支持多模态输入：
   * - 如果消息中包含 imageBuffer，则调用 recognizeImage 获取图片识别结果
   * - 如果消息中包含 audioBuffer，则调用 recognizeSpeech 获取语音识别结果
   * - 如果同时存在 text、imageBuffer 或 audioBuffer，将识别结果和原始文本整合到消息中
   * 最终将所有识别结果构造为 Gemini API 请求体需要的格式。
   */
  async formatBody(requestMessages: any) {
    if (typeof this.body !== 'object' || this.body === null) {
      this.body = {};
    }

    let formattedMessages: { role: string, parts: { text: string }[] }[] = [];

    // 处理每一条消息
    for (const item of requestMessages) {
      // 优先处理图片识别
      if (item.imageBuffer) {
        try {
          const imageResult = await this.recognizeImage(item.imageBuffer);
          // 将识别结果结合原始文本（如果有）
          let textContent = imageResult;
          if (item.content) {
            textContent = item.content + " | 图片识别结果：" + imageResult;
          }
          formattedMessages.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: textContent }]
          });
        } catch (error) {
          console.error("图片处理错误: ", error);
          formattedMessages.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: "图片识别失败" }]
          });
        }
      }

      // 处理语音识别
      if (item.audioBuffer) {
        try {
          const speechResult = await this.recognizeSpeech(item.audioBuffer);
          // 将识别结果结合原始文本（如果有）
          let textContent = speechResult;
          if (item.content) {
            textContent = item.content + " | 语音识别结果：" + speechResult;
          }
          formattedMessages.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: textContent }]
          });
        } catch (error) {
          console.error("语音处理错误: ", error);
          formattedMessages.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: "语音识别失败" }]
          });
        }
      }

      // 若消息中仅包含文本内容，则按原有逻辑添加
      if (!item.imageBuffer && !item.audioBuffer && item.content) {
        // 第一条消息添加系统提示
        if (formattedMessages.length === 0) {
          formattedMessages.push(
            {
              role: 'user',
              parts: [{ text: item.content }],
            },
            {
              role: 'model',
              parts: [{ text: '好的' }],
            }
          );
        } else {
          formattedMessages.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }],
          });
        }
      }
    }

    // 添加额外的 prompt 信息
    formattedMessages.push({
      role: 'user',
      parts: [{ text: 'prompt: research in english，respond in Chinese' }],
    });

    // 将格式化后的消息保存到 this.messages 中
    this.messages = formattedMessages;

    // 根据模型类型构造请求体
    if (['gemini-2.0-flash-exp', 'gemini-2.0-flash', 'gemini-2.0-pro-exp'].includes(this.model)) {
      this.body = {
        contents: this.messages,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        tools: [
          {
            googleSearch: {}
          }
        ]
      };
    } else {
      this.body = {
        contents: this.messages,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      };
    }
  }

  // 图片识别方法调用 Google Cloud Vision API
  async recognizeImage(imageBuffer: Buffer): Promise<string> {
    const request = {
      image: {
        content: imageBuffer.toString('base64'),
      },
    };

    try {
      const [result] = await this.visionClient.labelDetection(request);
      console.log('Vision API response:', result);
      const labels = result.labelAnnotations;
      if (labels && labels.length > 0) {
        return labels.map((label: any) => label.description).join(', ');
      } else {
        console.warn('No labels detected in image.');
        return '无法识别图片内容';
      }
    } catch (error) {
      console.error('Image recognition error:', error);
      throw error;
    }
  }

  // 语音识别方法调用 Google Cloud Speech API
  async recognizeSpeech(audioBuffer: Buffer): Promise<string> {
    const audio = {
      content: audioBuffer.toString('base64'),
    };

    const request = {
      audio: audio,
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
      },
    };

    try {
      const [response] = await this.speechClient.recognize(request);
      const transcription = response.results
        .map((result: any) => result.alternatives[0].transcript)
        .join('\n');
      console.log('Speech recognition result:', transcription);
      return transcription;
    } catch (error) {
      console.error('Speech recognition error:', error);
      throw error;
    }
  }

  handleResponse(responseData: any): string {
    if (responseData.candidates && responseData.candidates.length > 0) {
      if (
        responseData.candidates[0].content &&
        responseData.candidates[0].content.parts &&
        responseData.candidates[0].content.parts.length > 0
      ) {
        return responseData.candidates[0].content.parts[0].text;
      } else {
        return `${this.model} API 返回未知错误: 无法获取有效的响应文本`;
      }
    } else if (responseData.error) {
      const errorMessage = responseData.error.message || '未知错误';
      return `${this.model} API 错误: ${errorMessage}`;
    } else {
      return `${this.model} API 返回未知错误: 无法获取有效的响应`;
    }
  }
}
