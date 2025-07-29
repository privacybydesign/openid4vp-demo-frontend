// src/components/QRCodeComponent.tsx
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeComponentProps {
  text: string;
}

const QRCodeComponent = ({ text }: QRCodeComponentProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, text, { width: 200 }, (error: any) => {
        if (error) console.error(error);
      });
    }
  }, [text]);

  return <canvas ref={canvasRef} />;
};

export default QRCodeComponent;
