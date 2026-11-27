// src/components/QRCodeComponent.tsx
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeComponentProps {
  text: string;
  size?: number;
}

const QRCodeComponent = ({ text, size = 300 }: QRCodeComponentProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, text, { width: size }, (error: Error | null | undefined) => {
        if (error) console.error(error);
      });
    }
  }, [text, size]);

  return <canvas ref={canvasRef} role="img" aria-label="QR code" />;
};

export default QRCodeComponent;
