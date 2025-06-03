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

    // Refs to prevent multiple calls
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);
    const isMountedRef = useRef(true);
    const audioContextRef = useRef(null);
    const recognitionRef = useRef(null);
    const synthRef = useRef(window.speechSynthesis);
    
    // Critical: Prevent multiple simultaneous operations
    const isProcessingSpeechRef = useRef(false);
    const isSpeakingRef = useRef(false);
    const lastSpokenTextRef = useRef('');
    const speechTimeoutRef = useRef(null);

    const mainService = new ServiceChat();
    const googleSpeechService = new ServiceGoogleSpeech();

    // Initialize media recorder for speech (ONLY ONCE)
    const initMediaRecorder = useCallback(async () => {
        if (mediaRecorderRef.current || streamRef.current) {
            console.log('Media recorder already initialized');
            return true;
        }
        
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
                    setStatus("No audio captured. Please try speaking.");
                    // Retry listening after a delay
                    setTimeout(() => {
                        if (isMountedRef.current && !isSpeakingRef.current) {
                            startListening();
                        }
                    }, 2000);
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
            return true;
            
        } catch (error) {
            console.error('Error initializing media recorder:', error);
            setStatus("Microphone access denied. Please allow microphone access.");
            return false;
        }
    }, []);

    // Handle speech to text
    const handleSpeechToText = useCallback(async (audioBlob) => {
        if (isProcessingSpeechRef.current) {
            console.log('Already processing speech, skipping...');
            return;
        }
        
        isProcessingSpeechRef.current = true;
        
        try {
            setStatus("Processing speech...");
            let transcript = null;
            
            // Try Google Speech API first if available
            if (speechAPIAvailable && audioBlob) {
                try {
                    transcript = await googleSpeechService.speechToText(audioBlob);
                    console.log('Google STT result:', transcript);
                } catch (apiError) {
                    console.warn('Google STT failed:', apiError);
                    setSpeechAPIAvailable(false);
                }
            }
            
            // Fallback to browser recognition if no transcript
            if (!transcript && recognitionRef.current) {
                console.log('Trying browser recognition fallback...');
                transcript = await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        resolve(null);
                    }, 5000);
                    
                    recognitionRef.current.onresult = (event) => {
                        clearTimeout(timeout);
                        const result = event.results[0][0].transcript;
                        console.log('Browser recognition result:', result);
                        resolve(result);
                    };
                    
                    recognitionRef.current.onerror = (event) => {
                        console.error('Browser recognition error:', event.error);
                        clearTimeout(timeout);
                        resolve(null);
                    };
                    
                    recognitionRef.current.onend = () => {
                        clearTimeout(timeout);
                    };
                    
                    try {
                        recognitionRef.current.start();
                    } catch (e) {
                        console.error('Error starting browser recognition:', e);
                        clearTimeout(timeout);
                        resolve(null);
                    }
                });
            }
            
            if (transcript && transcript.trim()) {
                console.log('Final transcript:', transcript);
                setStatus("Processing your response...");
                
                // Determine which API to call based on current step
                if (step >= 11) {
                    await sendAnswerToAPI(transcript, assessmentIdRef.current);
                } else {
                    await sendChat(transcript, assessmentIdRef.current);
                }
            } else {
                console.warn('No transcript received from any source');
                setStatus("Could not understand. Please speak clearly and try again.");
                // Retry listening after a delay
                setTimeout(() => {
                    if (isMountedRef.current && !isSpeakingRef.current) {
                        startListening();
                    }
                }, 3000);
            }
        } catch (error) {
            console.error('Speech-to-Text error:', error);
            setStatus("Error processing speech. Please try again.");
            // Retry listening after a delay
            setTimeout(() => {
                if (isMountedRef.current && !isSpeakingRef.current) {
                    startListening();
                }
            }, 3000);
        } finally {
            isProcessingSpeechRef.current = false;
        }
    }, [step, googleSpeechService, speechAPIAvailable, assessmentIdRef]);

    // Text to speech handler
    const speakText = useCallback(async (text, isAiSpeaking = false, listenNext = true, stepNumber = 0) => {
        // Prevent multiple calls with same text
        if (isSpeakingRef.current || 
            !text || 
            !text.trim() || 
            lastSpokenTextRef.current === text ||
            aiSpeaking) {
            console.log('Skipping TTS - already speaking or duplicate text');
            return;
        }
        
        // Clear any existing speech timeout
        if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
        }
        
        isSpeakingRef.current = true;
        lastSpokenTextRef.current = text;
        
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
                    throw apiError;
                }
            } else {
                throw new Error('Speech API not available');
            }

            setAiSpeaking(false);
            setStatus("");

            // Start listening after AI finishes speaking
            if (listenNext && isMountedRef.current) {
                console.log('AI finished speaking, starting to listen...');
                speechTimeoutRef.current = setTimeout(() => {
                    if (!isListening && !aiSpeaking && !isProcessingSpeechRef.current) {
                        console.log('Starting listening after TTS completed');
                        startListening();
                    }
                }, 1500);
            }

            // Handle video step timing
            if (stepNumber === 8) {
                console.log('Preparing for video capture step');
                speechTimeoutRef.current = setTimeout(() => {
                    setCurrentDisplayText("");
                    setStep(stepNumber);
                }, 2000);

                setCurrentDisplayText("Please point to where you feel pain in the next 5 seconds");
            }
        } catch (error) {
            console.error('TTS error, using browser fallback:', error.message);
            
            return new Promise((resolve) => {
                if (synthRef.current) {
                    synthRef.current.cancel();
                    
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.rate = 0.9;
                    utterance.pitch = 1.0;
                    
                    utterance.onend = () => {
                        setAiSpeaking(false);
                        setStatus("");
                        
                        // Start listening after browser TTS finishes
                        if (listenNext && isMountedRef.current) {
                            console.log('Browser TTS finished, starting to listen...');
                            speechTimeoutRef.current = setTimeout(() => {
                                if (!isListening && !aiSpeaking && !isProcessingSpeechRef.current) {
                                    console.log('Starting listening after browser TTS completed');
                                    startListening();
                                }
                            }, 1500);
                        }
                        
                        if (stepNumber === 8) {
                            speechTimeoutRef.current = setTimeout(() => {
                                setCurrentDisplayText("");
                                setStep(stepNumber);
                            }, 2000);

                            setCurrentDisplayText("Please point to where you feel pain in the next 5 seconds");
                        }
                        
                        resolve();
                    };
                    
                    utterance.onerror = () => {
                        setAiSpeaking(false);
                        setStatus("");
                        resolve();
                    };
                    
                    synthRef.current.speak(utterance);
                } else {
                    setAiSpeaking(false);
                    setStatus("");
                    resolve();
                }
            });
        } finally {
            setTimeout(() => {
                isSpeakingRef.current = false;
                // Clear the last spoken text after a delay to allow for new different text
                lastSpokenTextRef.current = '';
            }, 500);
        }
    }, [googleSpeechService, speechAPIAvailable, aiSpeaking, isListening]);

    // Stop listening
    const stopListening = useCallback(() => {
        console.log('=== Stopping listening ===');
        
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (e) {
                console.warn('Error stopping recognition:', e);
            }
        }
        
        if (mediaRecorderRef.current?.state === 'recording') {
            try {
                mediaRecorderRef.current.stop();
            } catch (e) {
                console.warn('Error stopping media recorder:', e);
            }
        }
        
        setIsListening(false);
    }, []);

    // Send chat message
    const sendChat = useCallback(async (message, assID, isVideo = false) => {
        if (isProcessingSpeechRef.current) {
            console.log('Already processing, skipping chat');
            return;
        }
        
        isProcessingSpeechRef.current = true;

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
                const newMessage = { user: message };
                const updatedChats = [...chatHistory, newMessage];
                
                bodyChat = {
                    chat_history: updatedChats
                };
                
                setChatHistory(updatedChats);
            } else {
                bodyChat = {
                    chat_history: chatHistory,
                    video: message
                };
                console.log("Sending video for body part identification");
            }

            const res = await mainService.chatWithAI(bodyChat, '', assID);
            
            if (res?.success) {
                if (!isStart) {
                    setStage("chat");
                }
                
                const chatRes = res.data.response;
                const next_action = res.data.action;
                
                console.log("AI says:", chatRes);
                console.log("Action:", next_action);
                
                if (!isVideo) {
                    setChatHistory(prevChats => {
                        const updated = [...prevChats];
                        if (updated.length > 0 && !updated[updated.length - 1].response) {
                            updated[updated.length - 1].response = chatRes;
                        }
                        return updated;
                    });
                } else {
                    setChatHistory(prevChats => {
                        return [...prevChats, {
                            user: "[Showed pain location]",
                            response: chatRes
                        }];
                    });
                }
                
                if (next_action === "camera_on") {
                    console.log("Activating camera for body part identification");
                    setCurrentDisplayText(chatRes);
                    await speakText(chatRes, true, false, 8);
                } else if (next_action === "next_api") {
                    console.log("Moving to QnA phase");
                    setCurrentDisplayText("");
                    await speakText(chatRes, true, false);
                    setTimeout(() => {
                        setStep(11);
                        setAnalyser(false);
                    }, 1000);
                } else {
                    setCurrentDisplayText(chatRes);
                    await speakText(chatRes, true, true); // This will trigger listening after speaking
                }
            } else {
                console.error("API call failed:", res);
                setStatus("Error: Failed to get response");
            }
        } catch (error) {
            console.error('Chat API error:', error);
            setStatus("Error communicating with AI");
            setTimeout(() => {
                if (isMountedRef.current && !isSpeakingRef.current) {
                    startListening();
                }
            }, 2000);
        } finally {
            isProcessingSpeechRef.current = false;
        }
    }, [chatHistory, isStart, mainService, speakText, stopListening]);

    // Handle video from video capture
    const sendPainPointVideo = useCallback((base64Video) => {
        console.log("=== sendPainPointVideo called ===");
        console.log("Has video:", !!base64Video);
        
        const currentAssessmentId = assessmentIdRef.current || assessmentId;
        
        if (base64Video && currentAssessmentId) {
            console.log("Sending video to AI for body part identification");
            sendChat(base64Video, currentAssessmentId, true);
        } else {
            console.error("Missing video or assessment ID");
            setStatus("Error: Could not process video. Please try again.");
            setTimeout(() => {
                setStep(7);
                if (!isProcessingSpeechRef.current) startListening();
            }, 2000);
        }
    }, [assessmentId, sendChat]);

    // Send answer to QnA API
    const sendAnswerToAPI = useCallback(async (answer, assID) => {
        if (isProcessingSpeechRef.current) {
            console.log('Already processing, skipping QnA');
            return;
        }
        
        isProcessingSpeechRef.current = true;

        console.log('=== sendAnswerToAPI called ===');
        console.log('Answer:', answer);
        console.log('Assessment ID:', assID);
        
        setStatus("Processing answer...");
        setIsListening(false);
        stopListening();

        const newMessage = { user: answer };
        
        try {
            const updatedHistory = [...QnAHistory, newMessage];
            setQnAHistory(updatedHistory);
            
            const bodyChat = {
                chat_history: updatedHistory
            };

            const res = await mainService.chatWithQnAAI(bodyChat, '', assID);
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
                    await speakText(questionRes.question, true, true); // This will trigger listening after speaking
                }
            } else {
                console.error('QnA API returned unsuccessful response');
                setStatus("Error: Invalid response from server");
                setTimeout(() => {
                    if (isMountedRef.current && !isSpeakingRef.current) {
                        startListening();
                    }
                }, 2000);
            }
        } catch (error) {
            console.error('QnA API error:', error);
            setStatus("Error getting next question");
            setTimeout(() => {
                if (isMountedRef.current && !isSpeakingRef.current) {
                    startListening();
                }
            }, 2000);
        } finally {
            isProcessingSpeechRef.current = false;
        }
    }, [QnAHistory, isStart, mainService, stopListening, speakText]);

    // Start listening - SIMPLIFIED AND FIXED
    const startListening = useCallback(async () => {
        // Don't start if already listening, speaking, or processing
        if (isListening || 
            isSpeakingRef.current || 
            aiSpeaking ||
            isProcessingSpeechRef.current) {
            console.log('Cannot start listening - already active:', {
                isListening,
                isSpeaking: isSpeakingRef.current,
                aiSpeaking,
                isProcessing: isProcessingSpeechRef.current
            });
            return;
        }

        console.log('=== Starting listening ===');
        console.log('Current step:', step);
        console.log('Speech API available:', speechAPIAvailable);
        
        // Use browser recognition if speech API is not available
        if (!speechAPIAvailable && recognitionRef.current) {
            console.log('Using browser speech recognition');
            setIsListening(true);
            setStatus("Listening... (speak now)");
            
            recognitionRef.current.onstart = () => {
                console.log('Browser recognition started');
            };
            
            recognitionRef.current.onresult = async (event) => {
                const transcript = event.results[0][0].transcript;
                console.log('Browser recognition result:', transcript);
                setIsListening(false);
                setStatus("Processing your response...");
                
                if (step >= 11) {
                    await sendAnswerToAPI(transcript, assessmentIdRef.current);
                } else {
                    await sendChat(transcript, assessmentIdRef.current);
                }
            };
            
            recognitionRef.current.onerror = (event) => {
                console.error('Browser recognition error:', event.error);
                setIsListening(false);
                setStatus("Speech recognition error. Please try again.");
                setTimeout(() => {
                    if (isMountedRef.current && !isSpeakingRef.current) {
                        startListening();
                    }
                }, 2000);
            };
            
            recognitionRef.current.onend = () => {
                console.log('Browser recognition ended');
                setIsListening(false);
            };
            
            try {
                recognitionRef.current.start();
                return;
            } catch (error) {
                console.error('Error starting browser recognition:', error);
                setStatus("Error: Could not start listening");
                setIsListening(false);
                return;
            }
        }
        
        // For Google Speech API, use media recorder
        console.log('Using Google Speech API with media recorder');
        
        // Initialize media recorder if not already done
        if (!mediaRecorderRef.current) {
            console.log('Initializing media recorder...');
            const initialized = await initMediaRecorder();
            if (!initialized) {
                console.error('Failed to initialize media recorder');
                return;
            }
        }

        // Check if media recorder is ready
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
            setIsListening(true);
            setStatus("Listening... (speak now)");
            audioChunksRef.current = [];
            
            try {
                console.log('Starting media recorder...');
                mediaRecorderRef.current.start();
                
                // Auto-stop after 5 seconds
                setTimeout(() => {
                    if (mediaRecorderRef.current?.state === 'recording') {
                        console.log('Auto-stopping recording after 5 seconds');
                        mediaRecorderRef.current.stop();
                        setIsListening(false);
                    }
                }, 5000);
                
            } catch (error) {
                console.error('Error starting recording:', error);
                setStatus("Error: Could not start recording");
                setIsListening(false);
            }
        } else {
            console.warn('Media recorder not ready, state:', mediaRecorderRef.current?.state);
        }
    }, [step, speechAPIAvailable, aiSpeaking, isListening, initMediaRecorder, sendAnswerToAPI, sendChat]);

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

    // Initialize on mount (ONLY ONCE)
    useEffect(() => {
        isMountedRef.current = true;
        
        // Check speech API availability
        googleSpeechService.checkHealth().then(isAvailable => {
            setSpeechAPIAvailable(isAvailable);
            console.log('Speech API health check result:', isAvailable);
            
            // Force to true for debugging - you can remove this later
            if (!isAvailable) {
                console.log('Speech API not available, will use browser fallback');
            }
        }).catch(error => {
            console.warn('Speech API health check failed:', error);
            setSpeechAPIAvailable(false);
        });
        
        // Initialize browser speech recognition as fallback
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';
            console.log('Browser speech recognition initialized');
        } else {
            console.warn('Browser speech recognition not available');
        }

        return () => {
            isMountedRef.current = false;
            isProcessingSpeechRef.current = false;
            isSpeakingRef.current = false;
            
            if (speechTimeoutRef.current) {
                clearTimeout(speechTimeoutRef.current);
            }
            
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
    }, [googleSpeechService]);

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
        // Clear all timeouts
        if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
        }
        
        // Reset all refs
        isProcessingSpeechRef.current = false;
        isSpeakingRef.current = false;
        lastSpokenTextRef.current = '';
        
        // Reset state
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
        setAiSpeaking(false);
        setIsListening(false);
    }, []);

    return (
        <div className='bg-prime w-full h-screen overflow-hidden relative'>
            <div className='absolute top-0 left-0 w-full flex justify-center items-start z-50'>
                <div className='bg-white/90 px-4 py-2 rounded-md shadow-sm'>
                    {status}
                </div>
            </div>
            
            {/* Debug info and manual controls - remove in production */}
            <div className='absolute top-12 left-4 bg-black/70 text-white p-2 rounded text-xs space-y-1'>
                <div>Step: {step}</div>
                <div>Listening: {isListening ? 'Yes' : 'No'}</div>
                <div>AI Speaking: {aiSpeaking ? 'Yes' : 'No'}</div>
                <div>Speech API: {speechAPIAvailable ? 'Available' : 'Not Available'}</div>
                <div>Processing: {isProcessingSpeechRef.current ? 'Yes' : 'No'}</div>
                <div>Is Speaking Ref: {isSpeakingRef.current ? 'Yes' : 'No'}</div>
                
                {/* Manual listening button */}
                {!isListening && !aiSpeaking && !isProcessingSpeechRef.current && (
                    <button 
                        onClick={() => startListening()}
                        className="bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded text-xs mt-1"
                    >
                        Start Listening
                    </button>
                )}
                
                {isListening && (
                    <button 
                        onClick={() => stopListening()}
                        className="bg-red-500 hover:bg-red-600 px-2 py-1 rounded text-xs mt-1"
                    >
                        Stop Listening
                    </button>
                )}
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