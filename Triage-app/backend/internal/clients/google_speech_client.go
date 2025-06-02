package clients

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

var googleSpeechClient *GoogleSpeechClient

type GoogleSpeechClient struct {
	projectID   string
	sttEndpoint string
	ttsEndpoint string
	httpClient  *http.Client
}

// GetGoogleSpeechClient returns a singleton instance of GoogleSpeechClient
func GetGoogleSpeechClient() *GoogleSpeechClient {
	if googleSpeechClient == nil {
		projectID := os.Getenv("GOOGLE_CLOUD_PROJECT_ID")
		if projectID == "" {
			projectID = "dochq-staging" // fallback
		}

		// Create OAuth2 client using environment variable for credentials
		ctx := context.Background()
		
		// Check for GOOGLE_APPLICATION_CREDENTIALS environment variable
		credentialsPath := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
		if credentialsPath == "" {
			fmt.Printf("Warning: GOOGLE_APPLICATION_CREDENTIALS not set\n")
		}
		
		creds, err := google.FindDefaultCredentials(ctx, 
			"https://www.googleapis.com/auth/cloud-platform")
		if err != nil {
			// Log error but continue - will be handled in individual methods
			fmt.Printf("Warning: Google credentials not found: %v\n", err)
			fmt.Printf("Make sure GOOGLE_APPLICATION_CREDENTIALS points to your service account key file\n")
		}

		var httpClient *http.Client
		if creds != nil {
			httpClient = oauth2.NewClient(ctx, creds.TokenSource)
		} else {
			httpClient = &http.Client{}
		}

		googleSpeechClient = &GoogleSpeechClient{
			projectID:   projectID,
			sttEndpoint: "https://speech.googleapis.com/v1/speech:recognize",
			ttsEndpoint: "https://texttospeech.googleapis.com/v1/text:synthesize",
			httpClient:  httpClient,
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

	// Set headers for OAuth authentication
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-User-Project", c.projectID)

	// Make the request using authenticated HTTP client
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check for errors with detailed error messages
	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == 401 {
			return nil, fmt.Errorf("authentication failed - check GOOGLE_APPLICATION_CREDENTIALS (status %d): %s", resp.StatusCode, string(body))
		} else if resp.StatusCode == 403 {
			return nil, fmt.Errorf("permission denied - check project ID and API permissions (status %d): %s", resp.StatusCode, string(body))
		} else {
			return nil, fmt.Errorf("Google Speech API error (status %d): %s", resp.StatusCode, string(body))
		}
	}

	// Parse response
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return result, nil
}

// TextToSpeech converts text to audio using Google Text-to-Speech API with Chirp models
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

	// Set headers for OAuth authentication
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-User-Project", c.projectID)

	// Make the request using authenticated HTTP client
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check for errors with detailed error messages
	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == 401 {
			return nil, fmt.Errorf("authentication failed - check GOOGLE_APPLICATION_CREDENTIALS (status %d): %s", resp.StatusCode, string(body))
		} else if resp.StatusCode == 403 {
			return nil, fmt.Errorf("permission denied - check project ID and API permissions (status %d): %s", resp.StatusCode, string(body))
		} else {
			return nil, fmt.Errorf("Google Speech API error (status %d): %s", resp.StatusCode, string(body))
		}
	}

	// Parse response
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return result, nil
}