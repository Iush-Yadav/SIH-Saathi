"""Regenerate bundled Hindi prompts on macOS with the installed Lekha voice."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).parent
PROMPTS = {
    "hello": "नमस्ते! मैं साथी हूँ। आपका दिन अच्छा हो।",
    "remember": "इन चीज़ों को याद रखें। फिर तैयार बटन दबाएँ।",
    "remember-question": "कौन-सी चीज़ आपने अभी देखी?",
    "attention": "सभी सही चीज़ें छूएँ। फिर उत्तर जाँचें।",
    "routine": "इन कामों को सही क्रम में छूएँ।",
    "pattern": "इस क्रम में अगला क्या आएगा?",
    "correct": "बिल्कुल सही!",
    "retry": "कोई बात नहीं। अगला प्रयास साथ करते हैं।",
    "done": "अभ्यास के लिए शाबाश!",
    "reminders": "आज की यादें।",
    "reminders-done": "आज की सभी यादें पूरी हो गई हैं।",
    "medicine": "सुबह की दवा।",
    "water": "एक गिलास पानी पिएँ।",
    "walk": "दोपहर की सैर।",
    "appointment": "स्वास्थ्य की मुलाक़ात।",
    "help": "आप कह सकते हैं: याददाश्त खेल, ध्यान खेल, दवा की याद, या वापस।",
}

for name, words in PROMPTS.items():
    source = ROOT / f"{name}.aiff"
    target = ROOT / f"{name}.wav"
    target.unlink(missing_ok=True)
    subprocess.run(["say", "-v", "Lekha", "-o", str(source), words], check=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16", str(source), str(target)], check=True)
    source.unlink()
    if target.stat().st_size < 4097:
        raise RuntimeError(f"Empty generated audio: {target}")
