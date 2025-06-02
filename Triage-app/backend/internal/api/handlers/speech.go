package handlers

import (
	"ai-bot-deecogs/internal/clients"
	"ai-bot-deecogs/internal/helpers"
	"net/http"

	"github.com/gin-gonic/gin"
)

// SpeechToTextRequest represents the request body for speech-to-text conversion
type SpeechToTextRequest struct {
	Config struct {
		Encoding                string `json:"encoding"`
		SampleRateHertz         int    `json:"sampleRateHertz"`
		LanguageCode            string `json:"languageCode"`
		EnableAutomaticPunctuation bool `json:"enableAutomaticPunctuation"`
		Model                   string `json:"model,omitempty"`
	} `json:"config"`
	Audio struct {
		Content string `json:"content"` // Base64 encoded audio
	} `json:"audio"`
}

// TextToSpeechRequest represents the request body for text-to-speech conversion
type TextToSpeechRequest struct {
	Input struct {
		Text string `json:"text"`
	} `json:"input"`
	Voice struct {
		LanguageCode string `json:"languageCode"`
		Name         string `json:"name"`
		SsmlGender   string `json:"ssmlGender"`
	} `json:"voice"`
	AudioConfig struct {
		AudioEncoding string  `json:"audioEncoding"`
		SpeakingRate  float64 `json:"speakingRate"`
		Pitch         float64 `json:"pitch"`
		VolumeGainDb  float64 `json:"volumeGainDb"`
	} `json:"audioConfig"`
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

	// Call Google Speech-to-Text API through client
	result, err := clients.GetGoogleSpeechClient().SpeechToText(request)
	if err != nil {
		helpers.SendResponse(c.Writer, false, http.StatusInternalServerError, nil, err)
		return
	}

	helpers.SendResponse(c.Writer, true, http.StatusOK, result, nil)
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

	// Call Google Text-to-Speech API through client
	result, err := clients.GetGoogleSpeechClient().TextToSpeech(request)
	if err != nil {
		helpers.SendResponse(c.Writer, false, http.StatusInternalServerError, nil, err)
		return
	}

	helpers.SendResponse(c.Writer, true, http.StatusOK, result, nil)
}