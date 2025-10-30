import { setState } from "../content/content-states";

export async function injectScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(file);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = (err) => reject(err);
      (document.head || document.documentElement).appendChild(script);
    });
  }
  
 
export function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}
export async function captureAndUpload(rect) {
  try {
    // Step 1: capture screenshot
    const { dataUrl } = await sendMessagePromise({ command: "CAPTURE_PAGE" });
    if (!dataUrl) throw new Error("No screenshot captured");

    // Step 2: crop selected area
    const cropped = await cropImage(dataUrl, rect);

    // Step 3: upload cropped image
    // const { url } = await sendMessagePromise({
    //   command: "UPLOAD_SCREENSHOT",
    //   cropped,
    //   rect,
    //   isAction,
    // });

     
    return cropped;
  } catch (err) {
    console.error("❌ Capture/upload failed:", err);
  }
}
export const compare = async (oldUrl, newUrl) => {
  const response = await fetch(
    "https://mggvulbvgteamxghjoce.supabase.co/functions/v1/compare-images",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldImageUrl: oldUrl, newImageUrl: newUrl }),
    }
  );

  const result = await response.json();
  console.log("Gemini comparison:", result);
  return result;
};
  export async function DrawCanvas() {
   return new Promise((resolve) => {
     // Store original overflow styles
     const originalOverflow = document.body.style.overflow;
     const originalHtmlOverflow = document.documentElement.style.overflow;
     
     // Prevent scrolling
     document.body.style.overflow = 'hidden';
     document.documentElement.style.overflow = 'hidden';
     
     const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  overlay.style.zIndex = '999999';
  overlay.style.cursor = 'crosshair';
  document.body.appendChild(overlay);

  let startX, startY, endX, endY;
  let isSelecting = false;
  const selectionRect = document.createElement('div');
  selectionRect.style.border = '2px dashed #FFF';
  selectionRect.style.position = 'absolute';

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent default behavior
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    endX = startX;
    endY = startY;

    selectionRect.style.left = `${startX}px`;
    selectionRect.style.top = `${startY}px`;
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    overlay.appendChild(selectionRect);
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;
    e.preventDefault(); // Prevent default behavior
    endX = e.clientX;
    endY = e.clientY;
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    selectionRect.style.width = `${width}px`;
    selectionRect.style.height = `${height}px`;
    selectionRect.style.left = `${Math.min(startX, endX)}px`;
    selectionRect.style.top = `${Math.min(startY, endY)}px`;
  });

   overlay.addEventListener('mouseup', async (e) => {
  if (!isSelecting) return;
  e.preventDefault();
  isSelecting = false;

  // Store coordinates BEFORE removing overlay
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  const scrollY = window.scrollY || document.documentElement.scrollTop;

  const cropCoordinates = {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
    scrollX, 
    scrollY,
  };

  // Remove overlay and selection rect IMMEDIATELY
  overlay.remove();
  
  // Restore original overflow styles
  document.body.style.overflow = originalOverflow;
  document.documentElement.style.overflow = originalHtmlOverflow;

  // CRITICAL: Wait for DOM to update and repaint
  await new Promise(resolve => setTimeout(resolve, 100));

  if (cropCoordinates.width < 60 || cropCoordinates.height < 60) {
    console.log("Single click detected — skipping crop and download.");
    await setState({ compareImg: false });
    resolve(); 
    return;
  }

  try {
    // Capture AFTER overlay is removed and DOM is repainted
    const { dataUrl } = await sendMessagePromise({ command: "CAPTURE_PAGE" });
    const cropped = await cropImage(dataUrl, cropCoordinates);
    const actObj = { 
      type:"compareImage",
      description:"Click on Compare Image",
      rect: cropCoordinates,
      image_url: cropped,
      isTopFrame: true,
      iframeIdentifier: null
    };
    await sendMessagePromise({
      command: "recordAction",
      action: actObj
    });
    await setState({ compareImg: false });
  } catch (err) {
    console.error("Cropping failed:", err);
  }
  resolve();
});
  });
  
}

  export function cropImage(dataUrl, coords) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Adjust for device pixel ratio (for Retina/high-DPI displays)
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = coords.width * devicePixelRatio;
        canvas.height = coords.height * devicePixelRatio;

        ctx.drawImage(
          image,
          coords.x * devicePixelRatio,
          coords.y * devicePixelRatio,
          coords.width * devicePixelRatio,
          coords.height * devicePixelRatio,
          0,
          0,
          canvas.width,
          canvas.height
        );

        const croppedDataUrl = canvas.toDataURL('image/png');
        resolve(croppedDataUrl); // ✅ Return the cropped image
      } catch (err) {
        reject(err);
      }
    };

    image.onerror = (err) => reject(err);
    image.src = dataUrl;
  });
}

 
   

 