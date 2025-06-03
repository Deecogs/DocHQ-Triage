package handlers

import (
	"ai-bot-deecogs/internal/clients"
	"ai-bot-deecogs/internal/helpers"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

type SpeechToTextRequest struct {
	AudioContent string `json:"audio_content" binding:"required"`
	LanguageCode string `json:"language_code"`
}

type TextToSpeechRequest struct {
	Text         string  `json:"text" binding:"required"`
	VoiceName    string  `json:"voice_name"`
	LanguageCode string  `json:"language_code"`
	SpeakingRate float64 `json:"speaking_rate"`
}

func SpeechToText(c *gin.Context) {
	var request SpeechToTextRequest

	if err := c.ShouldBindJSON(&request); err != nil {
		log.Printf("Error binding JSON: %v", err)
		helpers.SendResponse(c.Writer, false, http.StatusBadRequest, nil, err)
		return
	}

	// Set default language code if not provided
	if request.LanguageCode == "" {
		request.LanguageCode = "en-US"
	}

	log.Printf("STT request received, audio size: %d, language: %s", len(request.AudioContent), request.LanguageCode)

	// Convert to Google API format
	googleRequest := map[string]interface{}{
		"config": map[string]interface{}{
			"encoding":                   "WEBM_OPUS",
			"sampleRateHertz":            48000,
			"languageCode":               request.LanguageCode,
			"enableAutomaticPunctuation": true,
			"model":                      "latest_long",
			"useEnhanced":                true,
		},
		"audio": map[string]interface{}{
			"content": request.AudioContent,
		},
	}

	result, err := clients.GetGoogleSpeechClient().SpeechToText(googleRequest)
	if err != nil {
		log.Printf("STT error: %v", err)
		helpers.SendResponse(c.Writer, false, http.StatusInternalServerError, nil, err)
		return
	}

	// Extract transcript from Google response
	transcript := ""
	if results, ok := result["results"].([]interface{}); ok && len(results) > 0 {
		if firstResult, ok := results[0].(map[string]interface{}); ok {
			if alternatives, ok := firstResult["alternatives"].([]interface{}); ok && len(alternatives) > 0 {
				if alt, ok := alternatives[0].(map[string]interface{}); ok {
					if t, ok := alt["transcript"].(string); ok {
						transcript = t
					}
				}
			}
		}
	}

	log.Printf("STT result: %s", transcript)

	helpers.SendResponse(c.Writer, true, http.StatusOK, map[string]interface{}{
		"transcript": transcript,
	}, nil)
}

func TextToSpeech(c *gin.Context) {
	var request TextToSpeechRequest

	if err := c.ShouldBindJSON(&request); err != nil {
		log.Printf("Error binding JSON: %v", err)
		helpers.SendResponse(c.Writer, false, http.StatusBadRequest, nil, err)
		return
	}

	// Set defaults if not provided
	if request.VoiceName == "" {
		request.VoiceName = "en-US-Neural2-F"
	}
	if request.LanguageCode == "" {
		request.LanguageCode = "en-US"
	}
	if request.SpeakingRate == 0 {
		request.SpeakingRate = 0.9
	}

	log.Printf("TTS request received for text: %s", request.Text[:min(50, len(request.Text))])

	// Convert to Google API format
	googleRequest := map[string]interface{}{
		"input": map[string]interface{}{
			"text": request.Text,
		},
		"voice": map[string]interface{}{
			"languageCode": request.LanguageCode,
			"name":         request.VoiceName,
		},
		"audioConfig": map[string]interface{}{
			"audioEncoding": "LINEAR16",
			"speakingRate":  request.SpeakingRate,
		},
	}

	result, err := clients.GetGoogleSpeechClient().TextToSpeech(googleRequest)
	if err != nil {
		log.Printf("TTS error: %v", err)
		helpers.SendResponse(c.Writer, false, http.StatusInternalServerError, nil, err)
		return
	}

	// Extract audio content
	audioContent := ""
	if ac, ok := result["audioContent"].(string); ok {
		audioContent = ac
	}

	log.Printf("TTS successful, audio size: %d", len(audioContent))

	helpers.SendResponse(c.Writer, true, http.StatusOK, map[string]interface{}{
		"audio_content": audioContent,
	}, nil)
}

func SpeechHealthCheck(c *gin.Context) {
	// Check if API key is set
	apiKeySet := false
	if os.Getenv("GOOGLE_CLOUD_API_KEY") != "" {
		apiKeySet = true
	}

	// Check if service account is set
	serviceAccountSet := false
	if os.Getenv("GOOGLE_APPLICATION_CREDENTIALS") != "" {
		serviceAccountSet = true
	}

	helpers.SendResponse(c.Writer, true, http.StatusOK, map[string]interface{}{
		"api_key_configured":         apiKeySet,
		"service_account_configured": serviceAccountSet,
		"api_working":                apiKeySet || serviceAccountSet,
	}, nil)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
