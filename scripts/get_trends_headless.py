import os
import time
import json
import glob
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

# --- CONFIGURATION ---
# We scrape "Bitcoin" which maps to the 'bitcoin' field in your React App
KEYWORD = "bitcoin" 
GEO = "US"
TIMEFRAME = "today 12-m" 

# MATCHING REACT APP FILENAME
OUTPUT_JSON = "public/btc_google_trends.json" 
DOWNLOAD_DIR = os.path.join(os.getcwd(), "temp_downloads")

if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)
if not os.path.exists("public"):
    os.makedirs("public")

def scrape_trends():
    print(f"🚀 Starting HEADLESS scraper for '{KEYWORD}'...")

    chrome_options = Options()
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36")
    
    prefs = {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "directory_upgrade": True
    }
    chrome_options.add_experimental_option("prefs", prefs)

    try:
        try:
            driver = webdriver.Chrome(options=chrome_options)
        except:
            from webdriver_manager.chrome import ChromeDriverManager
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)

        url = f"https://trends.google.com/trends/explore?date={TIMEFRAME.replace(' ', '%20')}&geo={GEO}&q={KEYWORD}"
        print(f"🔗 Navigating to: {url}")
        driver.get(url)

        wait = WebDriverWait(driver, 20)
        
        # Cookie Banner
        try:
            cookie_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.cookieBarConsentButton")))
            cookie_btn.click()
        except:
            pass

        # Download Button
        print("⏳ Waiting for chart...")
        download_button_xpath = "(//button[.//i[text()='file_download']])[1]"
        btn = wait.until(EC.element_to_be_clickable((By.XPATH, download_button_xpath)))
        driver.execute_script("arguments[0].click();", btn)
        
        time.sleep(5)
        
        files = glob.glob(os.path.join(DOWNLOAD_DIR, "*.csv"))
        if not files:
            raise Exception("No CSV found")
        
        csv_path = files[0]
        print(f"✅ CSV Downloaded: {csv_path}")

        # --- CONVERT TO REACT-FRIENDLY ARRAY FORMAT ---
        print("🔄 Converting to JSON Array...")
        json_output = []
        
        with open(csv_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        for line in lines:
            parts = line.strip().split(',')
            if len(parts) >= 2:
                date_str = parts[0]
                # Validate YYYY-MM-DD
                if len(date_str) == 10 and date_str.count('-') == 2:
                    try:
                        val = float(parts[1])
                        # This structure matches your App.jsx logic:
                        # row.bitcoin ?? row.btc ...
                        json_output.append({
                            "date": date_str,
                            "bitcoin": val
                        })
                    except ValueError:
                        continue

        # Save
        with open(OUTPUT_JSON, 'w') as f:
            json.dump(json_output, f, indent=2)
            
        print(f"🎉 Success! Saved {len(json_output)} records to {OUTPUT_JSON}")

    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)

    finally:
        try:
            driver.quit()
        except:
            pass

if __name__ == "__main__":
    scrape_trends()
