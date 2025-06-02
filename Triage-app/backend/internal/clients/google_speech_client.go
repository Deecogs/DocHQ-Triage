package clients

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

var googleSpeechClient *GoogleSpeechClient

type GoogleSpeechClient struct {
	apiKey      string
	sttEndpoint string
	ttsEndpoint string
}

// GetGoogleSpeechClient returns a singleton instance of GoogleSpeechClient
func GetGoogleSpeechClient() *GoogleSpeechClient {
	if googleSpeechClient == nil {
		googleSpeechClient = &GoogleSpeechClient{
			// Get API key from environment variable
			apiKey: os.Getenv("GOOGLE_CLOUD_API_KEY"),
			// Google Speech-to-Text API endpoint
			sttEndpoint: "https://speech.googleapis.com/v1/speech:recognize",
			// Google Text-to-Speech API endpoint
			ttsEndpoint: "https://texttospeech.googleapis.com/v1/text:synthesize",
		}
	}
	return googleSpeechClient
}

// SpeechToText converts audio to text using Google Speech-to-Text API
func (c *GoogleSpeechClient) SpeechToText(request interface{}) (map[string]interface{}, error) {
	// Convert request to JSON
	jsonData, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", c.sttEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.apiKey)

	// Make the request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check for errors
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return result, nil
}

// TextToSpeech converts text to audio using Google Text-to-Speech API
func (c *GoogleSpeechClient) TextToSpeech(request interface{}) (map[string]interface{}, error) {
	// Convert request to JSON
	jsonData, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", c.ttsEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.apiKey)

	// Make the request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check for errors
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return result, nil
}