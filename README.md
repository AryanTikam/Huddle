# Huddle: AI-Powered Meeting Intelligence Platform  

Huddle is an **AI-powered meeting intelligence platform** designed to revolutionize how organizations capture, process, and utilize spoken content.  
It provides seamless **recording, multilingual transcription, summarization, speaker recognition, and actionable insights** – helping teams stay productive in remote-first environments.  

---

## 🚀 Features  

- 🎙 **Meeting Recording** – Capture audio in real-time  
- 📝 **Multilingual Transcription** – Convert speech to text with multiple language support  
- 👤 **Speaker Recognition** – Identify and label speakers automatically  
- 📑 **Smart Summarization** – Get concise AI-powered meeting summaries (Google Gemini integration)  
- 🔍 **Searchable Transcripts** – Quickly find key discussion points  
- 📊 **Insights & Analytics** – Extract action items, decisions, and highlights  
- 🌐 **Frontend (React)** – Modern UI for smooth meeting management  
- ⚙️ **Backend (Flask)** – API-powered architecture for transcription, storage, and AI models  
- 🗄 **Database (MongoDB)** – Secure and scalable meeting data storage  

---

# ⚙️ Installation & Setup  

### 1️⃣ Clone the repository  
```bash
git clone https://github.com/AryanTikam/Huddle.git
cd Huddle
```

### 2️⃣ Backend Setup (Flask + Python)
```bash
cd backend
python -m venv venv
source venv/bin/activate   # On Windows: source venv/Scripts/activate
pip install -r requirements.txt
python app.py
```

### 3️⃣ Frontend Setup (React)
```bash
cd frontend
npm install
npm start
```

### 4️⃣ Seed Sample Chemistry Knowledge in Qdrant (RAG test)
```bash
cd backend
python scripts/populate_chemistry_qdrant.py --recreate
```

Optional arguments:
- `--qdrant-url` (default: `http://localhost:6333`)
- `--qdrant-api-key` (for Qdrant Cloud)
- `--collection` (default: `chemistry_knowledge`)
- `--mode` (`off-device` for Gemini embeddings, `local` for Ollama embeddings)
- `--test-query "..."` to run retrieval smoke test (pass empty string to skip)

### 3️⃣ Extension Setup 
```bash
cd extension
node build-extension.js
📝 To load the extension:
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select Huddle/extension/dist folder
5. Click the Huddle icon → opens as side panel!
```
