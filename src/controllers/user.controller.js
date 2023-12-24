 import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponce } from "../utils/ApiResponce.js";


const generateAccessAndRefreshTokens = async(userId)=>{
    try {
       const user = await User.findById(userId)
       const accessToken = user.generateAccessToken()
       const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken,refreshToken}
    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating tokens")
    }
}

 const registerUser = asyncHandler( async (req,res) => {
    const {fullname,email,username,password} = req.body 
    // console.log("email: ",email)

    // if(fullName === ""){
    //     throw new ApiError(400,"fullName is Required")
    // }

    if([fullname,email,username,password].some((field) =>
    field?.trim()==="")
    ){
        throw new ApiError(400,"All fields are required")
    }

    const existedUser = await User.findOne({
        $or:[{ username },{ email }]
    })

    if (existedUser){
        throw new ApiError(409,"username with this email or username already exist")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    } 

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new ApiError(400,"avatar file is required")
    }

   const user =  await User.create({
        fullname,
        avatar:avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    if(!createdUser){
        throw new ApiError(500,"Something went wrong while register")
    }

    return res.status(201).json(
        new ApiResponce(200,createdUser,"User registered Successfull")
    )
     

 }) 

 const loginUser = asyncHandler(async (req,res) =>{


     const {email,username,password} = req.body

     if (!username && !email) {
        throw new ApiError(400,"username or password is required")
     }

    const user = await User.findOne({
        $or:[{username},{email}]
     })

     if(!user) {
        throw new ApiError(404,"user does not exist")
     }

    const isPasswordValid = await user.isPasswordCorrect(password)
    
    if(!isPasswordValid){
        throw new ApiError(401,"invalid user crediantial")
    }

    const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const option = {
        httpOnly: true,
        secure:true
    }

    return res.status(200).cookie("accessToken",accessToken,option)
    .cookie("refreshToken",refreshToken,option)
    .json(
        new ApiResponce(
            200,{
                user: loggedInUser,accessToken,refreshToken
            }
        )
    )
 })

const logutUser = asyncHandler(async(req,res) => {
    User.findByIdAndUpdate(
        req.user._id,{
            $set:{
                refreshToken:undefined
            }
        },
        {
            new :true
        }
    )   

    const option = {
        httpOnly: true,
        secure:true
    }

    return res
    .status(200)
    .clearCookie("accessToken",option)
    .clearCookie("refreshToken",option)
    .json(new ApiResponce(200,{},"User Logged Out"))
})

 export {registerUser,loginUser,logutUser}