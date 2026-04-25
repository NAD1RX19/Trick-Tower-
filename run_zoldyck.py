
import sys
import os

# Add the current directory to sys.path to allow imports from zoldyck_py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from zoldyck_py.main import ZoldyckApp

if __name__ == "__main__":
    print("Initializing Zoldyck Assassination Board (Python Edition)...")
    app = ZoldyckApp()
    app.mainloop()
