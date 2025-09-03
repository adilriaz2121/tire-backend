import axios from "axios";
import FormData from "form-data";

const uploadService = {
  checkFileSize(fileBuffer, maxSizeMB = 10) {
    const maxSize = maxSizeMB * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
      throw new Error(`File size too large. Maximum allowed size is ${maxSizeMB}MB. Your file size: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)}MB`);
    }
    return true;
  },

  async uploadToCloudinary(fileBuffer, originalName) {
    try {
      this.checkFileSize(fileBuffer, 10);

      const formData = new FormData();
      formData.append("file", fileBuffer, { filename: originalName });
      formData.append("upload_preset", process.env.CLOUDNAIRY_UPLOAD_PRESET);

      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${process.env.CLOUDNAIRY_KEY}/image/upload`,
        formData,
        { headers: formData.getHeaders() }
      );

      return response.data.secure_url;
    } catch (error) {
      if (error.message && error.message.includes("File size too large")) {
        throw error;
      }
      console.error("Cloudinary upload error:", error.response?.data || error.message);
      throw new Error("Failed to upload image");
    }
  },
};

export default uploadService;