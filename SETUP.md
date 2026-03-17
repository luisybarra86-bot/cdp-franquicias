# Setup Instructions for cdp-franquicias

This document provides step-by-step installation instructions for the cdp-franquicias project on Windows, Mac, and Linux.

## Prerequisites
Before you begin, ensure you have the following installed:
- **Node.js** (includes npm)
- **Git**

### Installing Node.js
1. **Windows**:
   - Download the Windows Installer from the [Node.js official website](https://nodejs.org/).
   - Run the installer and follow the prompts.

2. **Mac**:
   - You can use [Homebrew](https://brew.sh/). Run the following command in your terminal:
     ```bash
     brew install node
     ```
   - Alternatively, download the installer from the [Node.js official website](https://nodejs.org/) and run it.

3. **Linux**:
   - You can install Node.js via your package manager. For example, on Ubuntu, you can run:
     ```bash
     sudo apt update
     sudo apt install nodejs npm
     ```
   - Alternatively, you can use the Nodesource repository for the latest versions:
     ```bash
     curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
     sudo apt-get install -y nodejs
     ```

### Installing Git
1. **Windows**:
   - Download the Git for Windows installer from [git-scm.com](https://git-scm.com/download/win) and run it.

2. **Mac**:
   - You can use Homebrew to install Git:
     ```bash
     brew install git
     ```
   - Alternatively, install the Xcode command line tools by running:
     ```bash
     xcode-select --install
     ```

3. **Linux**:
   - Install Git using your package manager. For example, on Ubuntu:
     ```bash
     sudo apt update
     sudo apt install git
     ```

## Cloning the Repository
Open your terminal (or command prompt) and run the following command:
```bash
git clone https://github.com/luisybarra86-bot/cdp-franquicias.git
```

## Installing Dependencies
Navigate into your cloned repository:
```bash
cd cdp-franquicias
```

Once you're in the project directory, install the necessary dependencies using npm:
```bash
npm install
```  

Now you should be ready to start the project!