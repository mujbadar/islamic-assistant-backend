const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

const identifyVerse = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    // Step 1: Convert audio to text using OpenAI's Whisper API with faster model
    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path));
    formData.append("model", "whisper-1");
    formData.append("response_format", "text"); // Get plain text response
    formData.append("language", "ar"); // Specify Arabic language

    const transcriptionResponse = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders(),
        },
      }
    );

    const transcribedText = transcriptionResponse.data;

    // Check cache for this transcription
    const cachedResult = cache.get(transcribedText);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    // Step 2: Use GPT to identify the verse and get YouTube videos in parallel
    const [verseResponse, ytResponse] = await Promise.all([
      axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: `You are an expert in Quranic verse identification with deep knowledge of Arabic text and Quranic structure. Your task is to identify the exact Surah and verse(s) from a given Arabic text segment. This segment could be from any part of the surah, not just the beginning.

### Verse Reference
- First, identify the exact Surah name and number
- Then identify the specific verse number(s)
- Include the full verse reference in Arabic
- If the text contains multiple verses, list all of them

### Pronunciation
- Transliteration in English
- Syllable breakdown
- Special pronunciation notes

### Translation
- English translation
- Key context and notes
- Significant words/phrases

### Surah Info
- Brief background
- Key themes
- Special significance

Important Guidelines:
1. Be extremely precise in verse identification
2. Cross-reference the Arabic text with standard Quranic text
3. If the text is unclear or incomplete, state this explicitly
4. If you're not 100% confident, explain why
5. Consider common recitation variations and pronunciation differences
6. Pay special attention to unique phrases or words that help identify the verse
7. Double-check the surah number and verse number before providing the response
8. Look for distinctive phrases or word combinations that appear in specific verses
9. Consider the context of surrounding verses even if not fully visible
10. Be aware that the segment might start or end mid-verse

Be concise but accurate. If uncertain, state why.`,
            },
            { role: "user", content: transcribedText },
          ],
          max_tokens: 800,
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      ),
      // Start YouTube search early with a generic query
      axios.get(`https://www.googleapis.com/youtube/v3/search`, {
        params: {
          part: "snippet",
          q: "Quran Kabah recitation",
          key: process.env.YOUTUBE_API_KEY,
          maxResults: 3,
          type: "video",
        },
      }),
    ]);

    const verseIdentification = verseResponse.data.choices[0].message.content;

    // Verify the identification with a second pass
    const verificationResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a Quranic verse verification expert. Your task is to verify if the given verse identification is correct for the provided Arabic text segment. Consider:

1. Does the identified surah and verse number match the Arabic text?
2. Are there any distinctive phrases that confirm or contradict the identification?
3. Could this segment belong to a different verse?
4. Is the context consistent with the identified verse?

Respond with either:
"VERIFIED: [surah name] [verse number]" if you confirm the identification
or
"REJECTED: [correct surah name] [correct verse number]" if you find an error

Be extremely precise and thorough in your verification.`,
          },
          {
            role: "user",
            content: `Arabic Text: ${transcribedText}\n\nProposed Identification: ${verseIdentification}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.1,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const verification = verificationResponse.data.choices[0].message.content;
    const isVerified = verification.startsWith("VERIFIED:");

    // If verification failed, use the corrected identification
    if (!isVerified) {
      const correctedMatch = verification.match(
        /REJECTED:\s*([^,]+),\s*(\d+)/i
      );
      if (correctedMatch) {
        verseIdentification = `### Verse Reference\nSurah ${correctedMatch[1]}, Verse ${correctedMatch[2]}\n\n${verseIdentification}`;
      }
    }

    // Extract Surah name and update YouTube results if found
    const surahMatch = verseIdentification.match(/Surah\s+([^,]+)/i);
    let videos = [];

    if (surahMatch) {
      const surahName = surahMatch[1].trim();
      // Only fetch specific surah videos if we found a match
      const specificYtResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/search`,
        {
          params: {
            part: "snippet",
            q: `${surahName} Kabah recitation`,
            key: process.env.YOUTUBE_API_KEY,
            maxResults: 3,
            type: "video",
          },
        }
      );

      videos = specificYtResponse.data.items.map((video) => ({
        title: video.snippet.title,
        videoId: video.id.videoId,
        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        thumbnail: video.snippet.thumbnails.medium.url,
        channelTitle: video.snippet.channelTitle,
      }));
    } else {
      // Use generic results if no surah found
      videos = ytResponse.data.items.map((video) => ({
        title: video.snippet.title,
        videoId: video.id.videoId,
        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        thumbnail: video.snippet.thumbnails.medium.url,
        channelTitle: video.snippet.channelTitle,
      }));
    }

    // Clean up the uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (error) {
      console.error("Error cleaning up file:", error);
    }

    const result = {
      transcribedText,
      verseIdentification,
      videos,
    };

    // Cache the result
    cache.set(transcribedText, result);

    // Response
    res.json(result);
  } catch (error) {
    console.error("Detailed error:", error);
    // Clean up file if it exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError);
      }
    }
    res.status(500).json({
      error: "Something went wrong.",
      details: error.message,
    });
  }
};

module.exports = {
  identifyVerse,
};
