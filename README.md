# Islamic Assistant Backend

A Node.js/Express backend for the Islamic Assistant application that provides AI-powered Islamic Q&A and Quranic verse identification services.

## Features

- AI-powered Islamic Q&A using GPT-3.5
- Quranic verse identification using Whisper API
- YouTube video recommendations
- Audio file processing
- RESTful API endpoints

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key
- YouTube API key

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/islamic-assistant-backend.git
cd islamic-assistant-backend
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:

```
OPENAI_API_KEY=your_openai_api_key
YOUTUBE_API_KEY=your_youtube_api_key
```

4. Start the server:

```bash
npm start
```

The server will be running at `http://localhost:3000`.

## API Endpoints

### POST /api/ask

Ask questions about Islam and get AI-powered answers.

Request body:

```json
{
  "question": "What is the significance of prayer in Islam?"
}
```

### POST /api/identify-verse

Upload an audio recording of a Quranic verse for identification.

Request: multipart/form-data

- audio: Audio file (mp3, wav, m4a, webm)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
