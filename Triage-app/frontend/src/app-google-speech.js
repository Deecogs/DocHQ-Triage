import React, { useEffect, useRef, useState, useCallback } from 'react';
import './assets/styles/app.css';
import AiAvatar from './core/components/AiAvatar';
import AiDashboard from './core/components/AiDashboard';
import AiQus from './core/components/AiQus';
import AiRomMain from './core/components/AiRomMain';
import AiVideo from './core/components/AiVideo';
import ServiceChat from './core/services/serviceChat';
import ServiceGoogleSpeech from './core/services/serviceGoogleSpeech';

export default function App() {
    const [chatHistory, setChatHistory] = useState([]);
    const [QnAHistory, setQnAHistory] = useState([]);
    const [aiSpeaking, setAiSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [nextQuestion, setNextQuestion] = useState(null);
    const [analyser, setAnalyser] = useState(null);
    const [status, setStatus] = useState("");
    const [currentDisplayText, setCurrentDisplayText] = useState("");
    const [stage, setStage] = useState("idle");
    const [isStart, setIsStart] = useState(false);
    const [isOpen, setIsOpen] = useState(true);
    const [assessmentId, setAssessmentId] = useState(null);
    const assessmentIdRef = useRef(null);
    const [step, setStep] = useState(0);
    const [speechAPIAvailable, setSpeechAPIAvailable] = useState(true);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);
    const isMountedRef = useRef(true);
    const audioContextRef = useRef(null);

    const mainService = new ServiceChat();
    const googleSpeechService = new ServiceGoogleSpeech();
    
    // Browser speech recognition fallback
    const recognitionRef = useRef(null);
    const synthRef = useRef(window.speechSynthesis);

    // Initialize media recorder
    const initMediaRecorder = useCallback(async () => {
        try {
            console.log('Initializing media recorder...');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48000
                } 
            });
            
            streamRef.current = stream;
            
            const recorder = new MediaRecorder(stream, { 
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            });

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                console.log('Recording stopped, processing audio...');
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];
                
                if (audioBlob.size > 0) {
                    await handleSpeechToText(audioBlob);
                } else {
                    console.warn('No audio data captured');
                    setStatus("No audio captured. Please try again.");
                    setTimeout(() => startListening(), 1000);
                }
            };

            mediaRecorderRef.current = recorder;
            
            // Initialize audio analyser
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 256;
            source.connect(analyserNode);
            setAnalyser(analyserNode);
            
            console.log('Media recorder initialized successfully');
            // Start listening immediately after initialization
            setTimeout(() => startListening(), 100);
            
        } catch (error) {
            console.error('Error initializing media recorder:', error);
            setStatus("Microphone access denied. Please allow microphone access and refresh.");
        }
    }, [handleSpeechToText]);

    // Handle speech to text with fallback
    const handleSpeechToText = useCallback(async (audioBlob) => {
        try {
            setStatus("Processing speech...");
            let transcript = null;
            
            // Try Google Speech API first if available
            if (speechAPIAvailable && audioBlob) {
                try {
                    transcript = await googleSpeechService.speechToText(audioBlob);
                } catch (apiError) {
                    console.warn('Google STT failed:', apiError);
                    setSpeechAPIAvailable(false);
                }
            }
            
            // If no transcript and browser recognition available, use it
            if (!transcript && recognitionRef.current && !audioBlob) {
                transcript = await new Promise((resolve) => {
                    recognitionRef.current.onresult = (event) => {
                        const result = event.results[0][0].transcript;
                        resolve(result);
                    };
                    
                    recognitionRef.current.onerror = () => {
                        resolve(null);
                    };
                    
                    recognitionRef.current.onend = () => {
                        if (!transcript) resolve(null);
                    };
                    
                    recognitionRef.current.start();
                    setStatus("Listening (browser mode)...");
                });
            }
            
            if (transcript) {
                console.log('Speech recognized:', transcript);
                // Determine which API to call based on current step
                if (step >= 11) {
                    // We're in QnA phase
                    await sendAnswerToAPI(transcript, assessmentIdRef.current);
                } else {
                    // We're in chat phase
                    await sendChat(transcript, assessmentIdRef.current);
                }
            } else {
                console.warn('No transcript received, prompting retry');
                setStatus("Could not understand. Please try again.");
                // Give user feedback and restart listening
                await speakText("I couldn't understand that. Please try again.", true, true);
            }
        } catch (error) {
            console.error('Speech-to-Text error:', error);
            setStatus("Error processing speech. Please try again.");
            // Give user feedback and restart listening
            await speakText("Sorry, there was an error. Please try again.", true, true);
        }
    }, [step, googleSpeechService, speakText, speechAPIAvailable]);

    // Text to speech handler with improved fallback
    const speakText = useCallback(async (text, isAiSpeaking = false, listenNext = true, stepNumber = 0) => {
        try {
            setAiSpeaking(true);
            if (isAiSpeaking) {
                setStatus("AI is speaking...");
            }

            if (speechAPIAvailable) {
                try {
                    const audioBlob = await googleSpeechService.textToSpeech(text);
                    await googleSpeechService.playAudio(audioBlob);
                } catch (apiError) {
                    console.warn('Google TTS failed, using browser TTS');
                    setSpeechAPIAvailable(false);
                    throw apiError; // Fall through to browser TTS
                }
            } else {
                throw new Error('Speech API not available');
            }

            setAiSpeaking(false);
            setStatus("");

            if (listenNext && isMountedRef.current) {
                startListening();
            }

            // Handle video step timing
            if (stepNumber === 8) {
                console.log('Preparing for video capture step');
                setTimeout(() => {
                    setCurrentDisplayText("");
                    setStep(stepNumber);
                }, 5000);

                for (let i = 5; i > 0; i--) {
                    setTimeout(() => {
                        setCurrentDisplayText(`Please be ready in ${i} seconds`);
                    }, (5 - i) * 1000);
                }
                setTimeout(() => setCurrentDisplayText(""), 5000);
            }
        } catch (error) {
            console.error('TTS error, using browser fallback:', error.message);
            setAiSpeaking(true);
            
            // Use browser TTS as fallback
            return new Promise((resolve) => {
                if (synthRef.current) {
                    // Cancel any ongoing speech
                    synthRef.current.cancel();
                    
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.rate = 0.9;
                    utterance.pitch = 1.0;
                    
                    utterance.onend = () => {
                        setAiSpeaking(false);
                        setStatus("");
                        if (listenNext && isMountedRef.current) {
                            startListening();
                        }
                        
                        // Handle video step timing
                        if (stepNumber === 8) {
                            console.log('Preparing for video capture step');
                            setTimeout(() => {
                                setCurrentDisplayText("");
                                setStep(stepNumber);
                            }, 5000);

                            for (let i = 5; i > 0; i--) {
                                setTimeout(() => {
                                    setCurrentDisplayText(`Please be ready in ${i} seconds`);
                                }, (5 - i) * 1000);
                            }
                            setTimeout(() => setCurrentDisplayText(""), 5000);
                        }
                        
                        resolve();
                    };
                    
                    utterance.onerror = () => {
                        setAiSpeaking(false);
                        setStatus("");
                        if (listenNext && isMountedRef.current) {
                            startListening();
                        }
                        resolve();
                    };
                    
                    synthRef.current.speak(utterance);
                } else {
                    setAiSpeaking(false);
                    setStatus("");
                    if (listenNext && isMountedRef.current) {
                        startListening();
                    }
                    resolve();
                }
            });
        }
    }, [googleSpeechService, speechAPIAvailable]);

    // Start listening with fallback support
    const startListening = useCallback(() => {
        console.log('Starting listening, current step:', step);
        console.log('Speech API available:', speechAPIAvailable);
        
        // If speech API not available and browser recognition exists, use it
        if (!speechAPIAvailable && recognitionRef.current) {
            console.log('Using browser speech recognition');
            setIsListening(true);
            setStatus("Listening (browser)...");
            
            recognitionRef.current.onresult = async (event) => {
                const transcript = event.results[0][0].transcript;
                console.log('Browser recognition result:', transcript);
                setIsListening(false);
                
                // Process the transcript
                if (step >= 11) {
                    await sendAnswerToAPI(transcript, assessmentIdRef.current);
                } else {
                    await sendChat(transcript, assessmentIdRef.current);
                }
            };
            
            recognitionRef.current.onerror = (event) => {
                console.error('Browser recognition error:', event.error);
                setIsListening(false);
                setStatus("Error: Could not understand. Please try again.");
                setTimeout(() => startListening(), 2000);
            };
            
            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
            
            try {
                recognitionRef.current.start();
            } catch (error) {
                console.error('Error starting browser recognition:', error);
                setStatus("Error: Could not start listening");
                setIsListening(false);
            }
            return;
        }
        
        // Use media recorder for Google Speech API
        if (!mediaRecorderRef.current) {
            console.log('Media recorder not initialized, initializing...');
            initMediaRecorder();
            return;
        }

        if (mediaRecorderRef.current.state === 'inactive') {
            setIsListening(true);
            setStatus("Listening...");
            audioChunksRef.current = [];
            
            try {
                mediaRecorderRef.current.start();
                console.log('Recording started');
                
                // Auto-stop after 5 seconds
                setTimeout(() => {
                    if (mediaRecorderRef.current?.state === 'recording') {
                        console.log('Auto-stopping recording after 5 seconds');
                        stopListening();
                    }
                }, 5000);
            } catch (error) {
                console.error('Error starting recording:', error);
                setStatus("Error: Could not start recording");
                setIsListening(false);
            }
        } else {
            console.log('Media recorder already in state:', mediaRecorderRef.current.state);
        }
    }, [initMediaRecorder, step, speechAPIAvailable, sendAnswerToAPI, sendChat]);

    // Stop listening
    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (e) {
                // Ignore errors when stopping
            }
        }
        
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        
        setIsListening(false);
    }, []);

    // Send chat message - FIXED VERSION
    const sendChat = useCallback(async (message, assID, isVideo = false) => {
        console.log("=== sendChat called ===");
        console.log("Message type:", isVideo ? "Video" : "Text");
        console.log("Assessment ID:", assID);
        
        if (!isVideo) {
            setCurrentDisplayText(message);
        }
        setStatus(isVideo ? "Processing video..." : "Talking to the AI...");
        setIsListening(false);
        stopListening();

        try {
            let bodyChat;
            
            if (!isVideo) {
                // For text messages: Add to chat history
                const newMessage = { user: message };
                const updatedChats = [...chatHistory, newMessage];
                
                bodyChat = {
                    chat_history: updatedChats
                };
                
                // Update local state immediately
                setChatHistory(updatedChats);
            } else {
                // For video: DO NOT add to chat history, send current history with video field
                bodyChat = {
                    chat_history: chatHistory,  // Use existing history as-is
                    video: message  // Add video as separate field
                };
                console.log("Sending video for body part identification");
                console.log("Video size:", message.length);
            }

            const res = await mainService.chatWithAI(bodyChat, '', assID);
            
            console.log("=== AI Response ===");
            console.log("Success:", res?.success);
            console.log("Response:", res?.data);
            
            if (res?.success) {
                if (!isStart) {
                    setStage("chat");
                }
                
                const chatRes = res.data.response;
                const next_action = res.data.action;
                
                console.log("AI says:", chatRes);
                console.log("Action:", next_action);
                
                if (!isVideo) {
                    // For text messages: Update the last entry with response
                    setChatHistory(prevChats => {
                        const updated = [...prevChats];
                        if (updated.length > 0 && !updated[updated.length - 1].response) {
                            updated[updated.length - 1].response = chatRes;
                        }
                        return updated;
                    });
                } else {
                    // For video responses: Add as new complete entry
                    setChatHistory(prevChats => {
                        return [...prevChats, {
                            user: "[Showed pain location]",
                            response: chatRes
                        }];
                    });
                }
                
                // Handle actions
                if (next_action === "camera_on") {
                    console.log("Activating camera for body part identification");
                    setCurrentDisplayText(chatRes);
                    await speakText(chatRes, true, false, 8);
                } else if (next_action === "next_api") {
                    console.log("Moving to QnA phase");
                    setCurrentDisplayText("");
                    await speakText(chatRes, true, false);
                    // Add small delay before transitioning to ensure smooth flow
                    setTimeout(() => {
                        setStep(11);
                        setAnalyser(false);
                    }, 500);
                } else {
                    setCurrentDisplayText(chatRes);
                    await speakText(chatRes, true);
                }
            } else {
                console.error("API call failed:", res);
                setStatus("Error: Failed to get response");
            }
        } catch (error) {
            console.error('Chat API error:', error);
            setStatus("Error communicating with AI");
            setTimeout(() => {
                if (isMountedRef.current) {
                    startListening();
                }
            }, 2000);
        }
    }, [chatHistory, isStart, mainService, speakText, startListening, stopListening]);

    // Handle video from video capture - RENAMED AND UPDATED
    const sendPainPointVideo = useCallback((base64Video) => {
        console.log("=== sendPainPointVideo called ===");
        console.log("Has video:", !!base64Video);
        console.log("Video size:", base64Video?.length || 0);
        console.log("Assessment ID:", assessmentId);
        console.log("Assessment ID Ref:", assessmentIdRef.current);
        
        // Use ref value which is more reliable
        const currentAssessmentId = assessmentIdRef.current || assessmentId;
        
        if (base64Video && currentAssessmentId) {
            console.log("Sending video to AI for body part identification");
            sendChat(base64Video, currentAssessmentId, true);
        } else {
            console.error("Missing video or assessment ID");
            setStatus("Error: Could not process video. Please try again.");
            // Go back to chat state
            setTimeout(() => {
                setStep(7);
                startListening();
            }, 2000);
        }
    }, [assessmentId, sendChat, startListening]);

    // Send answer to QnA API (for questionnaire phase)
    const sendAnswerToAPI = useCallback(async (answer, assID) => {
        console.log('=== sendAnswerToAPI called ===');
        console.log('Answer:', answer);
        console.log('Assessment ID:', assID);
        
        setStatus("Processing answer...");
        setIsListening(false);
        stopListening();

        const newMessage = { user: answer };
        
        setQnAHistory(prevHistory => {
            const updatedHistory = [...prevHistory, newMessage];
            console.log('Updated QnA history:', updatedHistory);
            
            const bodyChat = {
                chat_history: updatedHistory
            };

            mainService.chatWithQnAAI(bodyChat, '', assID)
                .then((res) => {
                    console.log('QnA API response:', res);
                    if (res?.success) {
                        if (isStart) {
                            setStage("QnA");
                        }
                        
                        const questionRes = res.data;
                        setNextQuestion(questionRes);
                        
                        setQnAHistory(prev => {
                            const updated = [...prev];
                            if (updated.length > 0) {
                                updated[updated.length - 1].assistant = questionRes.question;
                            }
                            return updated;
                        });
                        
                        if (questionRes.action === "rom_api") {
                            console.log('Moving to ROM phase');
                            setStep(20);
                        } else if (questionRes.action === "dashboard_api") {
                            console.log('Moving to Dashboard phase');
                            setStep(24);
                        } else {
                            // Speak the next question and continue listening
                            speakText(questionRes.question, true, true);
                        }
                    } else {
                        console.error('QnA API returned unsuccessful response');
                        setStatus("Error: Invalid response from server");
                        setTimeout(() => startListening(), 2000);
                    }
                })
                .catch(error => {
                    console.error('QnA API error:', error);
                    setStatus("Error getting next question");
                    setTimeout(() => {
                        if (isMountedRef.current) {
                            startListening();
                        }
                    }, 2000);
                });
            
            return updatedHistory;
        });
    }, [isStart, mainService, stopListening, speakText]);

    // Start assessment
    const startAssessment = useCallback(() => {
        const body = {
            userId: 1,
            anatomyId: 3,
            assessmentType: "PAIN",
        };
        
        mainService.createAssessment(body, '')
            .then(async (res) => {
                if (res?.success) {
                    const newAssessmentId = res.data.assessmentId;
                    setAssessmentId(newAssessmentId);
                    assessmentIdRef.current = newAssessmentId;
                    setIsStart(true);
                    await sendChat('Hello', newAssessmentId);
                }
            })
            .catch(error => {
                console.error('Error creating assessment:', error);
                setStatus("Error starting assessment");
            });
    }, [mainService, sendChat]);

    // Update ref when assessmentId changes
    useEffect(() => {
        assessmentIdRef.current = assessmentId;
    }, [assessmentId]);

    // Initialize on mount
    useEffect(() => {
        isMountedRef.current = true;
        
        // Check if speech API is available
        googleSpeechService.checkHealth().then(isAvailable => {
            setSpeechAPIAvailable(isAvailable);
            console.log('Speech API available:', isAvailable);
        });
        
        // Initialize browser speech recognition as fallback
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';
        }
        
        initMediaRecorder();

        return () => {
            isMountedRef.current = false;
            
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
            window.speechSynthesis.cancel();
        };
    }, [initMediaRecorder, googleSpeechService]);

    // Save ROM data
    const saveRomData = useCallback(async (romData) => {
        try {
            const res = await mainService.saveRomData(romData, '', assessmentId);
            console.log("ROM data saved:", res);
        } catch (error) {
            console.error('Error saving ROM data:', error);
            setStatus("Error saving ROM data");
        }
    }, [assessmentId, mainService]);

    // Reset assessment
    const reset = useCallback(() => {
        setStep(0);
        setIsStart(false);
        setIsOpen(true);
        setChatHistory([]);
        setQnAHistory([]);
        setAssessmentId(null);
        assessmentIdRef.current = null;
        setNextQuestion(null);
        setCurrentDisplayText("");
        setStatus("");
        setStage("idle");
    }, []);

    return (
        <div className='bg-prime w-full h-screen overflow-hidden relative'>
            <div className='absolute top-0 left-0 w-full flex justify-center items-start z-50'>
                <div className='bg-white/90 px-4 py-2 rounded-md shadow-sm'>
                    {status}
                </div>
            </div>
            
            <AiVideo step={step} next={sendPainPointVideo} />
            
            <AiQus 
                step={step}
                send={sendAnswerToAPI}
                onComplete={() => setStep(prev => prev + 1)}
                nextQuestion={nextQuestion}
            />
            
            {step < 8 && (
                <AiAvatar 
                    text={currentDisplayText} 
                    isStart={isStart} 
                    onStart={startAssessment} 
                    isOpen={isOpen} 
                    analyser={analyser} 
                    step={step}
                    isListening={isListening}
                    isAiSpeaking={aiSpeaking}
                />
            )}
            
            <AiRomMain 
                step={step} 
                next={() => setStep(prev => prev + 1)} 
                saveRomData={saveRomData} 
            />
            
            <AiDashboard 
                step={step} 
                assessmentId={assessmentId} 
                reset={reset} 
            /> 
        </div>
    );
}