import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import { loginSuccess } from "../../store/slices/authSlice";

const OAuthCallbackHandler: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      // Store the token and redirect to home page
      dispatch(loginSuccess(token));
      navigate("/");
    } else {
      // If there's no token, redirect to login page
      navigate("/login", { replace: true });
    }
  }, [token, dispatch, navigate]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <div>
        <h2>Authenticating...</h2>
        <p>Please wait while we complete your sign-in.</p>
      </div>
    </div>
  );
};

export default OAuthCallbackHandler;
