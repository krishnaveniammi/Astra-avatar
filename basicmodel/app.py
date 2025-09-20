import os
import re
import uuid
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import google.generativeai as genai
from gtts import gTTS
from googleapiclient.discovery import build

# ---------- Config ----------
from config import GEMINI_KEY, YOUTUBE_KEY   # ✅ keys in config.py

if not GEMINI_KEY or GEMINI_KEY == "YOUR_REAL_GEMINI_KEY":
    raise RuntimeError("Set GEMINI_KEY in config.py before running.")

genai.configure(api_key=GEMINI_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")

youtube = build("youtube", "v3", developerKey=YOUTUBE_KEY)

APP_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(APP_DIR, "static", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

# ---------- Keywords ----------
violent_keywords = ["kill", "murder", "suicide", "die", "harm", "slap", "hit", "hurt", "destroy"]
sad_keywords = ["sad", "lonely", "depressed", "upset", "tired"]

# ---------- Helpers ----------
EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "]+", flags=re.UNICODE
)

def strip_emojis(text: str) -> str:
    return EMOJI_RE.sub("", text)

def clean_for_tts(text: str):
    text = re.sub(r"http\S+", "", text)   # remove URLs
    text = re.sub(r"[^A-Za-z0-9\s,.!?]", "", text)  # remove emojis & symbols
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def get_playlist_themes(user_mood: str):
    prompt = f"""
    The user feels: {user_mood}

    🎯 Your reply must always include:
    - 2–3 short healing or motivational tips
    - EXACTLY 2 Telugu playlist themes
    - EXACTLY 2 Hindi playlist themes
    - EXACTLY 2 English playlist themes
    - Format playlists as list items starting with "-"
    """
    resp = model.generate_content(prompt)
    return resp.text.strip()

def get_youtube_resource(query):
    try:
        search_response = youtube.search().list(
            q=query,
            part="snippet",
            maxResults=1,
            type="playlist"
        ).execute()

        if search_response.get("items"):
            playlist_id = search_response["items"][0]["id"]["playlistId"]
            return f"https://www.youtube.com/playlist?list={playlist_id}"

        search_response = youtube.search().list(
            q=query,
            part="snippet",
            maxResults=1,
            type="video"
        ).execute()

        if search_response.get("items"):
            video_id = search_response["items"][0]["id"]["videoId"]
            return f"https://www.youtube.com/watch?v={video_id}"

    except Exception as e:
        return f"(link not available: {e})"

    return "No result found"

def add_playlist_links(reply: str):
    lines = reply.splitlines()
    new_lines = []
    for line in lines:
        raw = line.strip()
        if raw.startswith("-"):
            playlist_name = re.sub(r"^[-–•]+\s*", "", raw)
            playlist_name = re.sub(r"[^\w\s]", "", playlist_name)
            if playlist_name.strip():
                yt_link = get_youtube_resource(playlist_name.strip())
                new_lines.append(f"- {playlist_name.strip()} 🎵 {yt_link}")
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
    return "\n".join(new_lines)

def get_meditation_or_yoga():
    queries = [
        "Guided Meditation for Stress Relief",
        "Yoga Asanas for Depression",
        "Meditation for Positive Energy",
        "Yoga Nidra for Relaxation"
    ]
    links = []
    for q in queries:
        yt_link = get_youtube_resource(q)
        links.append(f"- {q} 🧘 {yt_link}")
    return "\n".join(links)

# ---------- Routes ----------
@app.route("/generate", methods=["POST"])
def generate():
    data = request.get_json(force=True)
    user_input = (data.get("input") or "").strip().lower()

    if user_input in ["exit", "quit", "bye"]:
        goodbye = """
Stay safe and positive. Goodbye!
Here are some playlists to keep your day bright:
- Telugu Relaxing Vibes
- Telugu Melody Hits
- Hindi Chillout Mix
- Hindi Motivation Songs
- English Happy Vibes
- English Focus Music
"""
        return jsonify({"output": add_playlist_links(goodbye)})

    if any(word in user_input for word in violent_keywords):
        warning = """
⚠️ Please don’t harm yourself or others.
You are not alone — here are helplines:
📞 India Helpline: 9152987821 (AASRA)
📞 India Women Helpline: 181
📞 Global Suicide Prevention: https://findahelpline.com

Meanwhile, here are some playlists for peace:
- Telugu Peaceful Music
- Telugu Healing Bhajans
- Hindi Relaxation Music
- Hindi Hope Songs
- English Stress Relief
- English Stay Strong Motivation
"""
        final_reply = f"{add_playlist_links(warning)}\n\n🌿 Meditation & Yoga Recommendations:\n{get_meditation_or_yoga()}"
        return jsonify({"output": final_reply})

    try:
        reply = get_playlist_themes(user_input)
        reply_with_links = add_playlist_links(reply)

        if any(word in user_input for word in sad_keywords):
            reply_with_links += f"\n\n🌿 Meditation & Yoga Recommendations:\n{get_meditation_or_yoga()}"

        return jsonify({"output": strip_emojis(reply_with_links)})

    except Exception as e:
        return jsonify({"error": f"generation failed: {e}"}), 500


@app.route("/speak", methods=["POST"])
def speak():
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()

    text = strip_emojis(text)
    text = clean_for_tts(text)

    try:
        filename = f"{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(AUDIO_DIR, filename)
        tts = gTTS(text=text, lang="en")
        tts.save(filepath)
        return jsonify({
            "audio": [{"lang": "en", "url": f"/static/audio/{filename}"}]
        })
    except Exception as e:
        return jsonify({"error": f"tts failed: {e}"}), 500


@app.route("/static/audio/<path:filename>")
def serve_audio(filename):
    return send_from_directory(AUDIO_DIR, filename, as_attachment=False)


# ---------- Root route now serves frontend ----------
@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
