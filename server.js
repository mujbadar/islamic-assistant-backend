const express = require("express");
const axios = require("axios");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Route to handle Islamic questions
app.post("/api/ask", async (req, res) => {
  const { question } = req.body;

  if (!question) return res.status(400).json({ error: "Question is required" });

  try {
    // Step 1: Get AI Summary
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a knowledgeable Islamic scholar. Provide clear, well-structured answers based on the Quran, Hadith, and trusted scholarly opinions. Follow these formatting rules:

1. Start with a brief introduction if needed
2. Use clear headings for different sections
3. When mentioning Arabic terms:
   - Write the Arabic term in Arabic script
   - Follow with its transliteration in parentheses
   - Then provide the English translation
4. For numbered lists:
   - Use bold numbers with periods: "1.", "2.", etc.
   - Use bold text for main points: "**Main Point**"
   - Use bullet points for sub-points with proper indentation
   - Example:
     1. **Main Point**:
        - Sub-point 1
        - Sub-point 2
5. Include relevant citations (Surah, verse, Hadith book and number, scholar's name) where applicable
6. End with a brief conclusion if appropriate

Maintain a respectful, scholarly tone and focus on authentic sources.`,
          },
          { role: "user", content: question },
        ],
        max_tokens: 800,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const summary = aiResponse.data.choices[0].message.content;

    const keywordResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "Extract the main topics or keywords from the given Islamic summary to use for a YouTube search. Keep it concise.",
          },
          { role: "user", content: question },
        ],
        max_tokens: 50,
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const searchQuery = keywordResponse.data.choices[0].message.content;

    // Step 3: Get related YouTube videos using refined search query
    const ytResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/search`,
      {
        params: {
          part: "snippet",
          q: searchQuery + " Islamic",
          key: YOUTUBE_API_KEY,
          maxResults: 6,
          type: "video",
        },
      }
    );

    const videoResults = ytResponse.data.items;

    // Step 4: Fetch channel details (view count)
    const channelIds = videoResults.map((video) => video.snippet.channelId);
    const uniqueChannelIds = [...new Set(channelIds)]; // Remove duplicates

    const channelResponse = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels`,
      {
        params: {
          part: "statistics",
          id: uniqueChannelIds.join(","), // Fetch multiple channels in one request
          key: YOUTUBE_API_KEY,
        },
      }
    );

    // Step 5: Create a map of channel view counts
    const channelViewsMap = {};
    channelResponse.data.items.forEach((channel) => {
      channelViewsMap[channel.id] = parseInt(channel.statistics.viewCount, 10);
    });

    // Step 6: Attach view count to each video and sort by highest channel views
    const sortedVideos = videoResults
      .map((video) => ({
        title: video.snippet.title,
        videoId: video.id.videoId,
        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        thumbnail: video.snippet.thumbnails.medium.url,
        channelTitle: video.snippet.channelTitle,
        channelId: video.snippet.channelId,
        channelViews: channelViewsMap[video.snippet.channelId] || 0, // Default to 0 if not found
      }))
      .sort((a, b) => b.channelViews - a.channelViews); // Sort by most viewed channel

    // Response
    res.json({
      question,
      summary,
      searchQuery,
      videos: sortedVideos,
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// New route for Quranic verse identification
app.post("/api/identify-verse", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    // Step 1: Convert audio to text using OpenAI's Whisper API
    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path));
    formData.append("model", "whisper-1");

    const transcriptionResponse = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          ...formData.getHeaders(),
        },
      }
    );

    const transcribedText = transcriptionResponse.data.text;

    // Step 2: Use GPT to identify the verse
    const verseResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are an expert in Quranic verse identification. Given a transcribed Arabic text, identify the exact Surah and verse number from the Quran. If the text matches multiple verses, provide the most likely match. Include the Arabic text of the verse and its translation.",
          },
          { role: "user", content: transcribedText },
        ],
        max_tokens: 500,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const verseIdentification = verseResponse.data.choices[0].message.content;

    // Step 3: Extract Surah name from verse identification
    const surahMatch = verseIdentification.match(/Surah\s+([^,]+)/i);
    const surahName = surahMatch ? surahMatch[1].trim() : null;

    // Step 4: Get Kabah recitation videos
    let videos = [];
    if (surahName) {
      const ytResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/search`,
        {
          params: {
            part: "snippet",
            q: `${surahName} Kabah recitation`,
            key: YOUTUBE_API_KEY,
            maxResults: 2,
            type: "video",
          },
        }
      );

      videos = ytResponse.data.items.map((video) => ({
        title: video.snippet.title,
        videoId: video.id.videoId,
        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        thumbnail: video.snippet.thumbnails.medium.url,
        channelTitle: video.snippet.channelTitle,
      }));
    }

    // Step 5: Clean up the uploaded file
    fs.unlinkSync(req.file.path);

    // Response
    res.json({
      transcribedText,
      verseIdentification,
      videos,
    });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
