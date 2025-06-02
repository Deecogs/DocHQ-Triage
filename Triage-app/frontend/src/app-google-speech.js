import React, { useEffect, useRef, useState } from 'react';

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
    const [nextQuestion, setNextQuestion] = useState(false);

    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [audioChunks, setAudioChunks] = useState([]);
    const [analyser, setAnalyser] = useState(true);

    const [status, setStatus] = useState("");
    const [currentDisplayText, setCurrentDisplayText] = useState("");
    const [stage, setStage] = useState("idle");

    const [isStart, setIsStart] = useState(false);
    const [isOpen, setIsOpen] = useState(true);
    const [isChat, setIsChat] = useState(false);

    const [assessmentId, setAssessmentId] = useState(3);
    const assessmentIdRef = useRef(3);
    const [step, setStep] = useState(0);

    const mainService = new ServiceChat();
    const googleSpeechService = new ServiceGoogleSpeech();

    // Initialize media recorder for speech capture
    const initMediaRecorder = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    setAudioChunks(prev => [...prev, event.data]);
                }
            };

            recorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await handleSpeechToText(audioBlob);
                setAudioChunks([]); // Clear chunks
            };

            setMediaRecorder(recorder);
        } catch (error) {
            console.error('Error initializing media recorder:', error);
            setStatus("Microphone access denied");
        }
    };

    // Google Speech-to-Text handler
    const handleSpeechToText = async (audioBlob) => {
        try {
            setStatus("Processing speech...");
            const transcript = await googleSpeechService.speechToText(audioBlob);
            
            if (transcript) {
                sendChat(transcript, assessmentIdRef.current);
            } else {
                setStatus("Could not understand. Please try again.");
                setTimeout(() => startListening(), 1000);
            }
        } catch (error) {
            console.error('Speech-to-Text error:', error);
            setStatus("Error processing speech. Please try again.");
            setTimeout(() => startListening(), 1000);
        }
    };

    // Google Text-to-Speech handler
    const speakText = async (text, isAiSpeaking = false, listenNext = true, step = 0) => {
        try {
            setAiSpeaking(true);
            if (isAiSpeaking) {
                setStatus("AI is speaking...");
            }

            // Get audio from Google TTS
            const audioBlob = await googleSpeechService.textToSpeech(text, {
                voiceName: 'en-US-Neural2-F', // Google's neural female voice
                speakingRate: 0.9
            });

            // Play the audio
            await googleSpeechService.playAudio(audioBlob);

            setAiSpeaking(false);
            setStatus("");

            if (listenNext) {
                startListening();
            }

            // Handle video step timing
            if (step === 8) {
                setTimeout(() => {
                    setCurrentDisplayText(``);
                    setStep(step);
                }, 5000);

                // Countdown timer
                for (let i = 5; i >= 0; i--) {
                    setTimeout(() => {
                        if (i === 0) {
                            setCurrentDisplayText(``);
                        } else {
                            setCurrentDisplayText(`Please be ready in ${i} seconds`);
                        }
                    }, (5 - i) * 1000);
                }
            }
        } catch (error) {
            console.error('Text-to-Speech error:', error);
            setAiSpeaking(false);
            setStatus("");
            
            // Fallback to browser TTS if Google TTS fails
            if ("speechSynthesis" in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 0.8;
                utterance.onend = () => {
                    if (listenNext) {
                        startListening();
                    }
                };
                window.speechSynthesis.speak(utterance);
            }
        }
    };

    const stopListening = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            setIsListening(false);
        }
    };

    const startListening = () => {
        if (!mediaRecorder) {
            initMediaRecorder();
            return;
        }

        if (mediaRecorder.state === 'inactive') {
            setIsListening(true);
            setStatus("Listening...");
            setAudioChunks([]); // Clear previous chunks
            
            mediaRecorder.start();
            
            // Auto-stop after 10 seconds of silence
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    stopListening();
                }
            }, 10000);
        }
    };

    const sendChat = async (message, assID, isImage = false) => {
        if (!isImage) {
            setCurrentDisplayText(message);
        }
        setStatus("Talking to the AI...");
        setIsListening(false);
        stopListening();

        // Create new message object
        const newMessage = { user: message };
        
        // Update chat history
        setChatHistory(prevChats => {
            const updatedChats = [...prevChats, newMessage];
            
            // Create bodyChat here where we have access to latest chats
            const bodyChat = {
                chat_history: updatedChats
            };
            console.log("bodyChat =>", bodyChat);

            // Make API call here where we have the latest chats
            mainService.chatWithAI(bodyChat, '', assID)
                .then(async (res) => {
                    if (res['success']) {
                        if (!isStart) {
                            setStage("chat");
                        }
                        
                        const chatRes = res['data']['response'];
                        
                        setChatHistory(latestChats => {
                            return latestChats.map((chat, index) => {
                                if (index === latestChats.length - 1) {
                                    return { ...chat, response: chatRes };
                                }
                                return chat;
                            });
                        });
                        
                        const next_action = res['data']['action'];
                        console.log("next_action =>", next_action);
                        
                        if (next_action === "camera_on") {
                            console.log("camera_on");
                            const pain_location_video_step = 8;
                            setCurrentDisplayText(chatRes);
                            await speakText(chatRes, true, false, pain_location_video_step);
                        } else if (next_action !== "next_api") {
                            setCurrentDisplayText(chatRes);
                            await speakText(chatRes, true);
                        } else {
                            setCurrentDisplayText("");
                            await speakText(chatRes, true, false);
                            const QnA_step = 11;
                            setStep(QnA_step);
                            setAnalyser(false);
                        }
                    }
                })
                .catch(error => {
                    console.error('Chat API error:', error);
                    setStatus("Error communicating with AI");
                });
            
            return updatedChats;
        });
    };

    const sendAnswerToAPI = async (answer, assID, isFinal = false) => {
        setStatus("Talking to the AI...");
        setIsListening(false);
        stopListening();

        // Create new answer object
        const newMessage = { user: answer };
        
        // Update chat history
        setQnAHistory(prevQuestions => {
            const updatedQuestions = [...prevQuestions, newMessage];
            
            const bodyChat = {
                chat_history: updatedQuestions
            };
            console.log("bodyChat =>", bodyChat);

            // Make API call here where we have the latest chats
            mainService.chatWithQnAAI(bodyChat, '', assID).then((res) => {
                console.log("chatWithQnAAI:res =>", res);
                if (res['success']) {
                    if (isStart) {
                        setStage("QnA");
                    }
                    
                    const questionRes = res['data'];
                    console.log("questionRes QnA =>", questionRes);
                    setNextQuestion(questionRes);
                    
                    setQnAHistory(prevQuestions => {
                        console.log("prevQuestions =>", prevQuestions);
                        return prevQuestions.map((chat, index) => {
                            if (index === prevQuestions.length - 1) {
                                return { ...chat, assistant: questionRes.question };
                            }
                            return chat;
                        });
                    });
                }
            });
            
            return updatedQuestions;
        });
    };

    const startAssessment = () => {
        var body = {
            userId: 1,
            anatomyId: 3,
            assessmentType: "PAIN",
        };
        
        mainService.createAssessment(body, '').then(async (res) => {
            if (res['success']) {
                const newAssessmentId = res['data']['assessmentId'];
                setAssessmentId(newAssessmentId);
                setIsStart(true);
                sendChat('Hi, Please wait while we are getting ready', newAssessmentId);
            }
        });
    };

    // Keep the ref updated with the latest state value
    useEffect(() => {
        assessmentIdRef.current = assessmentId;
    }, [assessmentId]);

    const reset = () => {
        setStep(0);
        setIsStart(false);
        setIsOpen(true);
    };

    useEffect(() => {
        // Initialize media recorder on component mount
        initMediaRecorder();
    }, []);

    const sendPainPointImage = (base64Image) => {
        if (base64Image) {
            sendChat(base64Image, assessmentId, true);
            console.log("proceeding to the QnA section");
        }
    };

    const saveRomData = async (romData) => {
        mainService.saveRomData(romData, '', assessmentId).then((res) => {
            console.log("res =>", res);
        });
    };

    return (
        <>
            <div className='bg-prime w-full h-screen overflow-hidden relative'>
                <div className='absolute top-0 left-0 w-full flex justify-center items-start'>
                    <div>{status}</div>
                </div>
                
                <AiVideo step={step} next={sendPainPointImage} />
                
                <AiQus 
                    step={step}
                    send={async (answer, isFinal = false) => {
                        const response = await sendAnswerToAPI(answer, assessmentId, isFinal);
                        console.log("response =>", response);
                        return response;
                    }}
                    onComplete={() => {
                        setStep(prev => prev + 1);
                    }}
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
                    />
                )}
                
                <AiRomMain 
                    step={step} 
                    next={() => {
                        setStep(prev => prev + 1);
                    }} 
                    saveRomData={saveRomData} 
                />
                
                <AiDashboard 
                    step={step} 
                    assessmentId={assessmentId} 
                    reset={reset} 
                /> 
            </div>
        </>
    );
}