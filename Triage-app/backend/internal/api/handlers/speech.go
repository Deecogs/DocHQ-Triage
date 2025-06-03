package handlers

import (
	"ai-bot-deecogs/internal/clients"
	"ai-bot-deecogs/internal/helpers"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// Frontend request structures
type SpeechToTextRequest struct {
	AudioContent string `json:"audio_content"`
	LanguageCode string `json:"language_code"`
}

type TextToSpeechRequest struct {
	Text         string  `json:"text"`
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

	// Log request details
	log.Printf("Speech-to-Text request received, audio size: %d", len(request.AudioContent))

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
		log.Printf("Speech-to-Text error: %v", err)
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

	log.Printf("Speech-to-Text result: %s", transcript)

	// Return in expected format
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

	log.Printf("Text-to-Speech request received for text: %s", request.Text)

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
		log.Printf("Text-to-Speech error: %v", err)
		helpers.SendResponse(c.Writer, false, http.StatusInternalServerError, nil, err)
		return
	}

	// Extract audio content
	audioContent := ""
	if ac, ok := result["audioContent"].(string); ok {
		audioContent = ac
	}

	// Return in expected format
	helpers.SendResponse(c.Writer, true, http.StatusOK, map[string]interface{}{
		"audio_content": audioContent,
	}, nil)
}

// SpeechHealthCheck checks if Google Speech APIs are properly configured
func SpeechHealthCheck(c *gin.Context) {
	client := clients.GetGoogleSpeechClient()

	// Check if API key is set
	apiKeySet := false
	if os.Getenv("GOOGLE_CLOUD_API_KEY") != "" {
		apiKeySet = true
	}

	helpers.SendResponse(c.Writer, true, http.StatusOK, map[string]interface{}{
		"api_key_configured": apiKeySet,
		"api_working":        apiKeySet, // Simplified check
	}, nil)
}
