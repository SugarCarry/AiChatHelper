import BaseModel from './BaseModel';
import speech from '@google-cloud/speech';
import vision from '@google-cloud/vision';

export default class Gemini extends BaseModel {
    speechClient: any;
    visionClient: any;

    constructor(requestModel: string, requestAuthorization: string, requestMessages: any) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${requestModel === "gemini" ? "gemini-pro" : requestModel}:generateContent?key=${requestAuthorization.replace('Bearer ', '')}`;
        super(requestModel, requestAuthorization, requestMessages, url);

        this.speechClient = new speech.SpeechClient();
        this.visionClient = new vision.ImageAnnotatorClient();
    }

    protected formatHeaders() {
        if (!this.headers) {
            this.headers = { 'Content-Type': 'application/json' };
        }
    }

    protected formatBody(requestMessages: any) {
        if (typeof this.body !== 'object' || this.body === null) {
            this.body = {};
        }

        let formattedMessages: { role: string, parts: { text: string }[] }[] = [];
        requestMessages.forEach((item: { role: string, content: string }, index: number) => {
            if (index === 0) {
                formattedMessages.push({
                    'role': 'user',
                    'parts': [{
                        'text': item.content,
                    }],
                }, {
                    'role': 'model',
                    'parts': [{
                        'text': '好的',
                    }],
                });
            } else if (index === 1 && item.role === 'assistant') {
                // 忽略掉第二条消息
            } else {
                formattedMessages.push({
                    'role': (item.role === 'assistant') ? 'model' : 'user',
                    'parts': [{
                        'text': item.content,
                    }],
                });
            }
        });

        // 添加 prompt: research in english，respond in Chinese
        formattedMessages.push({
            'role': 'user',
            'parts': [{
                'text': 'prompt: research in english，respond in Chinese',
            }],
        });

        this.messages = formattedMessages;

        if (['gemini-2.0-flash-exp', 'gemini-2.0-flash', 'gemini-2.0-pro-exp'].includes(this.model)) {
            this.body = {
                'contents': this.messages,
                "safetySettings": [
                    { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
                    { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
                    { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
                    { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
                ],
                "tools": [{  
                    "googleSearch": {},
                    "googleSpeech": {},
                    "googleVision": {}
                }]
            };
        } else {
            this.body = {
                'contents': this.messages,
                "safetySettings": [
                    { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
                    { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
                    { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
                    { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
                ]
            };
        }
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

        const [response] = await this.speechClient.recognize(request);
        const transcription = response.results.map((result: any) => result.alternatives[0].transcript).join('\n');
        return transcription;
    }

    async recognizeImage(imageBuffer: Buffer) {
        const request = {
            image: { content: imageBuffer.toString('base64') },
        };

        const [result] = await this.visionClient.labelDetection(request);
        const labels = result.labelAnnotations;
        return labels.map((label: any) => label.description).join(', ');
    }

    handleResponse(responseData: any) {
        if (responseData.candidates && responseData.candidates.length > 0) {
            if (responseData.candidates[0].content && responseData.candidates[0].content.parts &&
                responseData.candidates[0].content.parts.length > 0) {
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
