import { createSlice } from "@reduxjs/toolkit";
import { clearStoredUser, getStoredUser, storeUser } from "../lib/storage.js";

const initialState = {
  user: getStoredUser()
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action) {
      state.user = action.payload;
      if (action.payload) {
        storeUser(action.payload);
      } else {
        clearStoredUser();
      }
    },
    clearUser(state) {
      state.user = null;
      clearStoredUser();
    }
  }
});

export const { setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;
