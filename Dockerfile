# Step 1: Base image
FROM node:23-alpine

# Step 2: Set working directory
WORKDIR /usr/src/app

# Step 3: Copy only package files to install dependencies
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install --only=production

# Step 5: Copy the rest of the application code
COPY . .

# Step 6: Expose the correct port
EXPOSE 8000

# Step 7: Set environment variables (optional)
ENV NODE_ENV=production

# Step 8: Start the application
CMD ["npm", "start"]
