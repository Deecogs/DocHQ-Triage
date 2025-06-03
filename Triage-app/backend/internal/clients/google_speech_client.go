// backend/internal/clients/google_speech_client.go
package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

var googleSpeechClient *GoogleSpeechClient

type GoogleSpeechClient struct {
	projectID    string
	sttEndpoint  string
	ttsEndpoint  string
	httpClient   *http.Client
	isConfigured bool
}

// GetGoogleSpeechClient returns a singleton instance of GoogleSpeechClient
func GetGoogleSpeechClient() *GoogleSpeechClient {
	if googleSpeechClient == nil {
		projectID := os.Getenv("GOOGLE_CLOUD_PROJECT_ID")
		if projectID == "" {
			projectID = "dochq-staging"
		}

		ctx := context.Background()

		// Check for credentials
		credentialsPath := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
		isConfigured := false
		var httpClient *http.Client

		if credentialsPath == "" {
			log.Println("Warning: GOOGLE_APPLICATION_CREDENTIALS not set")
			// Try to find credentials in common locations
			possiblePaths := []string{
				"./dochq-staging-72db3155a22d.json",
				"../dochq-staging-72db3155a22d.json",
				"../../dochq-staging-72db3155a22d.json",
			}

			for _, path := range possiblePaths {
				if _, err := os.Stat(path); err == nil {
					os.Setenv("GOOGLE_APPLICATION_CREDENTIALS", path)
					credentialsPath = path
					log.Printf("Found credentials at: %s", path)
					break
				}
			}
		}

		if credentialsPath != "" {
			creds, err := google.FindDefaultCredentials(ctx,
				"https://www.googleapis.com/auth/cloud-platform")
			if err != nil {
				log.Printf("Error loading Google credentials: %v", err)
				httpClient = &http.Client{}
			} else {
				httpClient = oauth2.NewClient(ctx, creds.TokenSource)
				isConfigured = true
				log.Println("Google credentials loaded successfully")
			}
		} else {
			log.Println("No Google credentials found")
			httpClient = &http.Client{}
		}

		googleSpeechClient = &GoogleSpeechClient{
			projectID:    projectID,
			sttEndpoint:  "https://speech.googleapis.com/v1/speech:recognize",
			ttsEndpoint:  "https://texttospeech.googleapis.com/v1/text:synthesize",
			httpClient:   httpClient,
			isConfigured: isConfigured,
		}
	}
	return googleSpeechClient
}

// SpeechToText converts audio to text using Google Speech-to-Text API
func (c *GoogleSpeechClient) SpeechToText(request interface{}) (map[string]interface{}, error) {
	if !c.isConfigured {
		return nil, fmt.Errorf("Google Speech API not configured - missing credentials")
	}

	jsonData, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", c.sttEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-User-Project", c.projectID)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("Google Speech API error response: %s", string(body))
		if resp.StatusCode == 401 {
			return nil, fmt.Errorf("authentication failed - check GOOGLE_APPLICATION_CREDENTIALS")
		} else if resp.StatusCode == 403 {
			return nil, fmt.Errorf("permission denied - enable Speech API in Google Cloud Console")
		}
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return result, nil
}

// TextToSpeech converts text to audio using Google Text-to-Speech API
func (c *GoogleSpeechClient) TextToSpeech(request interface{}) (map[string]interface{}, error) {
	if !c.isConfigured {
		return nil, fmt.Errorf("Google Speech API not configured - missing credentials")
	}

	jsonData, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", c.ttsEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-User-Project", c.projectID)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		log.Printf("Google TTS API error response: %s", string(body))
		if resp.StatusCode == 401 {
			return nil, fmt.Errorf("authentication failed - check GOOGLE_APPLICATION_CREDENTIALS")
		} else if resp.StatusCode == 403 {
			return nil, fmt.Errorf("permission denied - enable Text-to-Speech API in Google Cloud Console")
		}
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return result, nil
}

// IsConfigured returns whether the client is properly configured
func (c *GoogleSpeechClient) IsConfigured() bool {
	return c.isConfigured
}
