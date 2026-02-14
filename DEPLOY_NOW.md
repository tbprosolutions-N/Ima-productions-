# Deploy the current build to production (30 seconds)

The **dist** folder is already built and ready.

1. Open **https://app.netlify.com** and go to your site (npc-am.com).
2. Open the **Deploys** tab.
3. **Drag and drop** this folder onto the deploy zone:
   ```
   c:\Users\tbsol\Downloads\OS\dist
   ```
4. Wait for the deploy to complete. The live app will update at https://npc-am.com

---

**If you changed code and need a fresh build first:** In a terminal in the project folder run `npm run build`, then do steps 1–4 above with the new **dist** folder.
