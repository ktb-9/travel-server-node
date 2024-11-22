# Step 1: Base image for building the application
FROM node:23-alpine AS build

# Step 2: Set working directory
WORKDIR /usr/src/app

# Step 3: Copy only package files to install dependencies
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install

# Step 5: Copy the rest of the application code
COPY . .

# Step 6: Compile TypeScript code
RUN npm run build

# Step 7: Base image for running the application (final image)
FROM node:23-alpine

# Step 8: Set working directory
WORKDIR /usr/src/app

# Step 9: Copy compiled files and necessary configs from the build stage
COPY --from=build /usr/src/app/build ./build
COPY --from=build /usr/src/app/package*.json ./

# Step 10: Install only production dependencies
RUN npm install --only=production

# Step 11: Expose the correct port
EXPOSE 8000

# Step 12: Set environment variables (optional)
ENV NODE_ENV=production

# Step 13: Start the application
CMD ["node", "build/app.js"]
