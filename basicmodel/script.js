// script.js - send flow, keeps "Thinking..." until audio starts or reply arrives
document.addEventListener('DOMContentLoaded', () => {
  const sendButton = document.getElementById('sendButton');
  const userInput = document.getElementById('userInput');
  const responseBox = document.getElementById('responseBox');

  sendButton.addEventListener('click', async () => {
    const text = (userInput.value || "").trim();
    if (!text) return;
    responseBox.innerText = "Thinking...";

    try {
      // 1) Generate reply
      const genResp = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text })
      });
      const genData = await genResp.json();
      if (genData.error) {
        responseBox.innerText = "Generation error: " + genData.error;
        return;
      }
      const replyText = genData.output || "I am here to help.";

      // 2) Request TTS (or lipsync pipeline) - your backend endpoint might be /speak or /speak_and_lipsync
      const speakResp = await fetch('/speak', { // keep same endpoint you have
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText })
      });
      const speakData = await speakResp.json();

      if (speakData.error || !speakData.audio || !speakData.audio.length) {
        // fallback - show text immediately
        responseBox.innerText = replyText;
        return;
      }

      // use the first audio URL
      const audioUrl = speakData.audio[0].url;
      let player = document.getElementById('chatAudioPlayer');
      if (!player) {
        player = document.createElement('audio');
        player.id = 'chatAudioPlayer';
        player.hidden = true;
        document.body.appendChild(player);
      }
      player.src = audioUrl;

      // once audio plays, reveal text and call lipsync/animation (if you have a handler)
      player.onplay = () => {
        responseBox.innerText = replyText;
        try {
          const scene = window.chatSceneInstance ? window.chatSceneInstance() : null;
          if (scene && window.triggerChatSpeaking) {
            window.triggerChatSpeaking(player, replyText);

          }
        } catch (e) { console.warn(e); }
      };

      // play (user clicked -> should allow autoplay)
      await player.play().catch(err => {
        console.warn("Audio play blocked or failed:", err);
        // reveal text anyway
        responseBox.innerText = replyText;
      });

    } catch (err) {
      console.error(err);
      responseBox.innerText = "Error: " + (err.message || err);
    }
  });
});
