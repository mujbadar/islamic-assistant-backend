const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

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
            content:
              "You are a knowledgeable Islamic scholar. Answer strictly based on the Quran, Hadith, and trusted scholarly opinions. Cite exact sources (Surah, verse, Hadith book and number, scholar's name) wherever applicable.",
          },
          { role: "user", content: question },
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

// Default route
app.get("/", (req, res) => {
  res.send("Islamic Q&A API is running...");
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
