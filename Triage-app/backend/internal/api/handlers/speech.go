// backend/internal/api/handlers/speech.go
package handlers

import (
	"ai-bot-deecogs/internal/clients"
	"ai-bot-deecogs/internal/helpers"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// SpeechToTextRequest represents the request body for speech-to-text conversion
type SpeechToTextRequest struct {
	AudioContent string `json:"audio_content"`
	LanguageCode string `json:"language_code"`
}

// TextToSpeechRequest represents the request body for text-to-speech conversion
type TextToSpeechRequest struct {
	Text         string  `json:"text"`
	VoiceName    string  `json:"voice_name"`
	LanguageCode string  `json:"language_code"`
	SpeakingRate float64 `json:"speaking_rate"`
}

// SpeechToText handles POST /api/speech-to-text
// @Summary Convert speech to text using Google Speech-to-Text API
// @Description Converts audio data to text using Google's Speech-to-Text service
// @Tags Speech
// @Accept json
// @Produce json
// @Param request body SpeechToTextRequest true "Speech-to-Text Request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/speech-to-text [post]
func SpeechToText(c *gin.Context) {
	var request SpeechToTextRequest

	if err := c.ShouldBindJSON(&request); err != nil {
		helpers.SendResponse(c.Writer, false, http.StatusBadRequest, nil, err)
		return
	}

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

	// Call Google Speech-to-Text API
	result, err := clients.GetGoogleSpeechClient().SpeechToText(googleRequest)
	if err != nil {
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

	helpers.SendResponse(c.Writer, true, http.StatusOK, map[string]interface{}{
		"transcript": transcript,
	}, nil)
}

// TextToSpeech handles POST /api/text-to-speech
// @Summary Convert text to speech using Google Text-to-Speech API
// @Description Converts text to audio using Google's Text-to-Speech service
// @Tags Speech
// @Accept json
// @Produce json
// @Param request body TextToSpeechRequest true "Text-to-Speech Request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/text-to-speech [post]
func TextToSpeech(c *gin.Context) {
	var request TextToSpeechRequest

	if err := c.ShouldBindJSON(&request); err != nil {
		helpers.SendResponse(c.Writer, false, http.StatusBadRequest, nil, err)
		return
	}

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

	// Call Google Text-to-Speech API
	result, err := clients.GetGoogleSpeechClient().TextToSpeech(googleRequest)
	if err != nil {
		helpers.SendResponse(c.Writer, false, http.StatusInternalServerError, nil, err)
		return
	}

	// Extract audio content
	audioContent := ""
	if ac, ok := result["audioContent"].(string); ok {
		audioContent = ac
	}

	helpers.SendResponse(c.Writer, true, http.StatusOK, map[string]interface{}{
		"audio_content": audioContent,
	}, nil)
}

// CheckSpeechHealth checks if Google Speech API is properly configured
// @Summary Check Google Speech API health
// @Description Verifies Google Speech API configuration and connectivity
// @Tags Speech
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 503 {object} map[string]interface{}
// @Router /api/health/speech [get]
func CheckSpeechHealth(c *gin.Context) {
	// Check if credentials are set
	apiKey := os.Getenv("GOOGLE_CLOUD_API_KEY")
	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT_ID")

	health := map[string]interface{}{
		"api_key_set":    apiKey != "",
		"project_id_set": projectID != "",
		"project_id":     projectID,
		"api_key_length": len(apiKey), // Don't expose the actual key
	}

	// Test actual API connection
	client := clients.GetGoogleSpeechClient()
	testRequest := map[string]interface{}{
		"input": map[string]interface{}{"text": "test"},
		"voice": map[string]interface{}{
			"languageCode": "en-US",
			"name":         "en-US-Standard-A",
		},
		"audioConfig": map[string]interface{}{
			"audioEncoding": "MP3",
		},
	}

	_, err := client.TextToSpeech(testRequest)
	health["api_connected"] = err == nil
	if err != nil {
		health["api_error"] = err.Error()
	}

	// Use the standard response format
	statusCode := http.StatusOK
	if err != nil || apiKey == "" {
		statusCode = http.StatusServiceUnavailable
	}

	helpers.SendResponse(c.Writer, err == nil && apiKey != "", statusCode, health, nil)
}
