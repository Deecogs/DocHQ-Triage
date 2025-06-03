import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from "motion/react";

export default function AiVideo({ step, next }) {
    const videoRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const [timer, setTimer] = useState(5);
    const [isRecording, setIsRecording] = useState(false);
    const hasProcessedRef = useRef(false);

    // Convert blob to base64
    const blobToBase64 = useCallback((blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }, []);

    // Initialize camera and start recording
    const startRecording = useCallback(async () => {
        try {
            console.log("Starting video recording...");
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }, 
                audio: false 
            });
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            const mimeType = 'video/webm;codecs=vp8,opus';
            const options = { mimeType };
            
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                console.warn(`${mimeType} is not supported, using default`);
                options.mimeType = 'video/webm';
            }

            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("Recording stopped, processing video...");
                
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                
                try {
                    const base64Video = await blobToBase64(blob);
                    console.log("Video converted to base64, size:", base64Video.length);
                    
                    stream.getTracks().forEach(track => track.stop());
                    if (videoRef.current) {
                        videoRef.current.srcObject = null;
                    }
                    
                    if (next && !hasProcessedRef.current) {
                        hasProcessedRef.current = true;
                        queueMicrotask(() => {
                            next(base64Video);
                        });
                    }
                } catch (error) {
                    console.error("Error converting video to base64:", error);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            console.log("Recording started");

        } catch (error) {
            console.error("Error starting recording:", error);
            alert("Unable to access camera. Please check permissions.");
        }
    }, [blobToBase64, next]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            console.log("Stopping recording...");
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, []);

    useEffect(() => {
        if (parseInt(step) === 8 && !isRecording && !hasProcessedRef.current) {
            hasProcessedRef.current = false;
            setTimer(5);
            startRecording();
        }
        
        return () => {
            if (parseInt(step) !== 8) {
                stopRecording();
                if (videoRef.current && videoRef.current.srcObject) {
                    const tracks = videoRef.current.srcObject.getTracks();
                    tracks.forEach(track => track.stop());
                    videoRef.current.srcObject = null;
                }
            }
        };
    }, [step, isRecording, startRecording, stopRecording]);

    useEffect(() => {
        if (parseInt(step) === 8 && isRecording) {
            const interval = setInterval(() => {
                setTimer(prev => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [step, isRecording]);

    useEffect(() => {
        if (timer === 0 && isRecording) {
            stopRecording();
        }
    }, [timer, isRecording, stopRecording]);

    if (parseInt(step) !== 8) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, translateY: '300px' }} 
                animate={{ opacity: 1, translateY: 0 }} 
                exit={{ opacity: 0, translateY: '300px' }} 
                className='w-full h-screen flex items-center justify-center relative'
            >
                <div className='w-[60%]'>
                    <div className='w-full pt-[56.25%] relative border-[6px] border-primeLight rounded-[20px] overflow-hidden shadow-2xl'>
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className='object-cover absolute inset-0 w-full h-full' 
                        />
                        
                        <div className='bg-white absolute top-[20px] left-[20px] text-txtMain p-3 rounded-tl-[14px] rounded-tr-[2px] rounded-br-[14px] rounded-bl-[2px] text-lg font-semibold shadow-lg'>
                            {isRecording ? (
                                <div className='flex items-center gap-2'>
                                    <div className='w-3 h-3 bg-red-500 rounded-full animate-pulse'></div>
                                    Recording: {timer}s
                                </div>
                            ) : (
                                'Processing...'
                            )}
                        </div>
                        
                        <div className='bg-white/90 absolute bottom-[20px] left-1/2 transform -translate-x-1/2 px-6 py-2 rounded-full text-sm'>
                            Please point to where you feel pain
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}