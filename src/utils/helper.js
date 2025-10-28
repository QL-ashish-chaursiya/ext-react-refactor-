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
export async function captureAndUpload(rect, isAction = false) {
  try {
    // Step 1: capture screenshot
    const { dataUrl } = await sendMessagePromise({ command: "CAPTURE_PAGE" });
    if (!dataUrl) throw new Error("No screenshot captured");

    // Step 2: crop selected area
    const cropped = await cropImage(dataUrl, rect);

    // Step 3: upload cropped image
    const { url } = await sendMessagePromise({
      command: "UPLOAD_SCREENSHOT",
      cropped,
      rect,
      isAction,
    });

    console.log("✅ Uploaded URL:", url);
    return url;
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
export async function DrawCanvas(dataUrl){
     // Create a semi-transparent overlay to cover the page.
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
 
    // Track mouse events to draw the selection rectangle.
    let startX, startY, endX, endY;
    let isSelecting = false;
    let selectionRect = document.createElement('div');
    selectionRect.style.border = '2px dashed #FFF';
    selectionRect.style.position = 'absolute';
 
    overlay.addEventListener('mousedown', (e) => {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      selectionRect.style.left = `${startX}px`;
      selectionRect.style.top = `${startY}px`;
      overlay.appendChild(selectionRect);
    });
 
    overlay.addEventListener('mousemove', (e) => {
      if (!isSelecting) return;
      endX = e.clientX;
      endY = e.clientY;
      selectionRect.style.width = `${Math.abs(endX - startX)}px`;
      selectionRect.style.height = `${Math.abs(endY - startY)}px`;
      selectionRect.style.left = `${Math.min(startX, endX)}px`;
      selectionRect.style.top = `${Math.min(startY, endY)}px`;
    });
 
    overlay.addEventListener('mouseup', async () => {
      if (isSelecting) {
        isSelecting = false;
        overlay.remove(); // Remove the overlay after selection is complete.
 
        // Send the cropping coordinates back to the background script.
        const cropCoordinates = {
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          width: Math.abs(endX - startX),
          height: Math.abs(endY - startY),
        };
        const  cropped = await cropImage(dataUrl, cropCoordinates);
        downloadImage(cropped);
        const { url } = await sendMessagePromise({
      command: "UPLOAD_SCREENSHOT",
      cropped,
      rect:cropCoordinates,
      isAction:true,
    });
}})

    
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

 
    export function downloadImage(dataUrl) {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'screenshot.png';
      link.click();
    }

 