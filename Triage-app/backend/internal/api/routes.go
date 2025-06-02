package api

import (
	"ai-bot-deecogs/internal/api/handlers"

	"github.com/gin-gonic/gin"
)

// SetupRoutes initializes API routes
func SetupRoutes(router *gin.Engine) {
	// User routes
	router.POST("/users", handlers.CreateUser)
	router.GET("/users/:id", handlers.GetUser)

	// Authentication routes
	router.POST("/auth/loginuser", handlers.LoginUser)

	// Assessment routes
	router.POST("/assessments", handlers.CreateAssessment)
	router.GET("/assessments/:assessmentId", handlers.GetAssessment)
	router.POST("/assessments/:assessmentId/chat", handlers.SendChatToAIHandler)
	router.POST("/assessments/:assessmentId/status", handlers.UpdateAssessmentStatus)
	router.POST("/assessments/:assessmentId/questionnaires", handlers.SendQuestionsToAIHandler)
	router.GET("/assessments/:assessmentId/questionnaires", handlers.GetQuestionnaires)

	// ROM Analysis routes
	router.POST("/assessments/:assessmentId/rom", handlers.SubmitROMAnalysis)
	router.GET("/assessments/:assessmentId/rom", handlers.GetROMAnalysisByAssessmentId)
	router.GET("/assessments/:assessmentId/dashboard", handlers.GetDashboardData)
	router.GET("/assessments/:assessmentId/dashboardByAssessmentId", handlers.GetDashboardDataByAssessmentId)
	

	// AI Analysis routes
	// router.GET("/assessments/:assessmentId/ai-analysis", handlers.GetAIAnalysis)

	// Self-Care Plan routes
	// router.GET("/assessments/:assessmentId/self-care-plans", handlers.GetSelfCarePlans)

	// Physio Call Schedules routes
	// router.POST("/assessments/:assessmentId/physio-calls", handlers.SchedulePhysioCall)
	// router.GET("/assessments/:assessmentId/physio-calls", handlers.GetPhysioCalls)

	// Google Speech API routes
	router.POST("/api/speech-to-text", handlers.SpeechToText)
	router.POST("/api/text-to-speech", handlers.TextToSpeech)

}
