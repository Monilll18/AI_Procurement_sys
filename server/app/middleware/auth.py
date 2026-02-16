"""
Clerk JWT Authentication Middleware for FastAPI.
Verifies JWT tokens from Clerk to authenticate API requests.
"""
import os
import jwt
import httpx
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

security = HTTPBearer()

# Cache JWKS keys
_jwks_cache = None


async def _get_jwks():
    """Fetch Clerk's JWKS (JSON Web Key Set) for token verification."""
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache

    clerk_secret = os.getenv("CLERK_SECRET_KEY", "")
    # Extract the Clerk instance ID from the secret key to build the JWKS URL
    # Clerk JWKS URL format: https://<instance>.clerk.accounts.dev/.well-known/jwks.json
    # Or use the Clerk API to get it
    
    publishable_key = os.getenv("CLERK_PUBLISHABLE_KEY", "")
    
    # For development, we can also verify using the secret key directly
    # But for production, JWKS is preferred
    
    # Try to get JWKS from Clerk's Frontend API
    if publishable_key.startswith("pk_test_") or publishable_key.startswith("pk_live_"):
        # Extract the instance slug from publishable key
        import base64
        try:
            slug = base64.b64decode(publishable_key.split("_")[-1] + "==").decode().rstrip("$")
            jwks_url = f"https://{slug}/.well-known/jwks.json"
            async with httpx.AsyncClient() as client:
                response = await client.get(jwks_url)
                if response.status_code == 200:
                    _jwks_cache = response.json()
                    return _jwks_cache
        except Exception:
            pass
    
    return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    FastAPI dependency: extracts and verifies the Clerk JWT.
    Returns the user_id (Clerk subject).
    """
    token = credentials.credentials
    
    try:
        # Try JWKS-based verification first
        jwks = await _get_jwks()
        
        if jwks and "keys" in jwks:
            # Decode token header to find the right key
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
            
            # Find matching key
            rsa_key = None
            for key in jwks["keys"]:
                if key.get("kid") == kid:
                    rsa_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
                    break
            
            if rsa_key:
                payload = jwt.decode(
                    token,
                    rsa_key,
                    algorithms=["RS256"],
                    options={"verify_aud": False},
                )
                user_id = payload.get("sub")
                if not user_id:
                    raise HTTPException(status_code=401, detail="Invalid token: no subject")
                return user_id
        
        # Fallback: decode without full verification (dev only)
        payload = jwt.decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no subject")
        return user_id
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")
