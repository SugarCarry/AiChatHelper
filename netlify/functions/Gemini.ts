import BaseModel from './BaseModel';
import speech from '@google-cloud/speech';
import vision from '@google-cloud/vision';

export default class Gemini extends BaseModel {
  speechClient: any;
  visionClient: any;

  constructor(requestModel: string, requestAuthorization: string, requestMessages: any) {
    // Remove the "Bearer " prefix from the authorization token to extract the API key.
    const apiKey = requestAuthorization.replace('Bearer ', '');
    // Log the API key extraction for debugging (be cautious not to expose sensitive data in production)
    console.log('Extracted API key:', apiKey);
    
    // Construct the request URL based on the model.
    const modelPart = requestModel === "gemini" ? "gemini-pro" : requestModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelPart}:generateContent?key=${apiKey}`;
    console.log('Request URL:', url);

    // Call the BaseModel constructor with the constructed URL.
    super(requestModel, requestAuthorization, requestMessages, url);

    // Initialize the Google Cloud clients.
    this.speechClient = new speech.SpeechClient();
    this.visionClient = new vision.ImageAnnotatorClient();
  }

  protected formatHeaders() {
    if (!this.headers) {
      this.headers = { 'Content-Type': 'application/json' };
    }
    console.log('Formatted Headers:', this.headers);
  }

  protected formatBody(requestMessages: any) {
    if (typeof this.body !== 'object' || this.body === null) {
      this.body = {};
    }

    let formattedMessages: { role: string; parts: { text: string }[] }[] = [];
    requestMessages.forEach((item: { role: string; content: string }, index: number) => {
      if (index === 0) {
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
      } else if (index === 1 && item.role === 'assistant') {
        // Skip the second message if it's from the assistant.
      } else {
        formattedMessages.push({
          role: item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: item.content }],
        });
      }
    });

    // Append an additional message prompt.
    formattedMessages.push({
      role: 'user',
      parts: [{ text: 'prompt: research in english，respond in Chinese' }],
    });

    this.messages = formattedMessages;
    console.log('Formatted Messages:', this.messages);

    // Build the request body according to model types.
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
            googleSearch: {},
            googleSpeech: {},
            googleVision: {}
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
    
    console.log('Request Body:', JSON.stringify(this.body, null, 2));
  }

  async recognizeSpeech(audioBuffer: Buffer) {
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

    // Log the speech request configuration
    console.log('Speech Request:', request);

    const [response] = await this.speechClient.recognize(request);
    const transcription = response.results
      .map((result: any) => result.alternatives[0].transcript)
      .join('\n');
    return transcription;
  }

  async recognizeImage(imageBuffer: Buffer) {
    const request = {
      image: { content: imageBuffer.toString('base64') },
    };

    // Log the image request configuration
    console.log('Image Request:', request);

    const [result] = await this.visionClient.labelDetection(request);
    const labels = result.labelAnnotations;
    return labels.map((label: any) => label.description).join(', ');
  }

  handleResponse(responseData: any) {
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
