 import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponce } from "../utils/ApiResponce.js";
import Jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async(userId)=>{
    try {
       const user = await User.findById(userId)
       const accessToken = user.generateAccessToken()
       const refreshToken = user.generateRefreshToken()

        user.resreshToken = refreshToken
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

const refreshAccessToken = asyncHandler(async (req,res)=>{
    const incomingRefreshToken = req.cookies.
    refreshToken || req.body.refreshToken

    if(!incomingRefreshToken) {
        throw new ApiError(401,"unauthorized request")
    }

    try {
        const decodedToken = Jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user) {
            throw new ApiError(401,"Invalid Refresh Token") 
        }
    
        if(incomingRefreshToken !== uesr?.resreshToken) {
            throw new ApiError(401,"Refresh Token is Expire/Used")
        }
    
        const option = {
            httpOnly:true,
            secure:true
        }
    
        const {accessToken,newrefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken",accessToken,option)
        .cookie("refreshToken",newrefreshToken,option)
        .json(
            new ApiResponce(
                200,
                {accessToken,refreshToken:newrefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401,error?.message ||
            "Invalid refresh Token")
    }
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400,"invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res.status(200)
    .json(new ApiResponce(200,"password changed successfully"))


})

const getCurrentUser = asyncHandler(async(req,res) =>{
    return res.status(200).json(200,req.user,"current user fetched successfully")

})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullname,email} = req.body

    if(!fullname || !email){
        throw new ApiError(400,"all feilds are required")

    }

    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullname,
                email
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponce(200,user,"Account Details Updated Successfully"))
})

const updateUserAvatar = asyncHandler(async(req,res)=>{
     const avatarLocalPath = req.file?.path

     if(!avatarLocalPath) {
        throw new ApiError(400,"Avatar file is missing")
     }

     const avatar = await uploadOnCloudinary(avatarLocalPath)

     if(!avatar.url){
        throw new ApiError(400,"Error while Uploading on Avatar")
     }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new: true}

     ).select("-password")

     return res
       .status(200)
       .json(
        new ApiResponce(200,user,"Avatar updated ")
       )
})

const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath) {
       throw new ApiError(400,"CoverImage file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
       throw new ApiError(400,"Error while Uploading on coverImage")
    }

    const user = await User.findByIdAndUpdate(
       req.user?._id,
       {
           $set:{
            coverImage:coverImage.url
           }
       },
       {new: true}

    ).select("-password")

       return res
       .status(200)
       .json(
        new ApiResponce(200,user,"coverImage updated")
       )

})

const getUserChannelProfile = asyncHandler(async(req,res)=>{
    const {username} = req.params
    
    if(!username?.trim()) {
        throw new ApiError(400,"username is missing")
    }

    const channel =  await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase()
            },
            
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscriberTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                     $cond: {
                        if:{$in: [req.user?._id,"$subscribers.subscriber"]},
                        then:true,
                        else:false
                     }
                }
            }
        },
        {
            $project:{
                fullName:1,
                username:1,
                subscribersCount:1,
                channelsSubscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404,"channel does not exist")
    }

    return res
    .status(200)
    .json(
        new ApiResponce(200,channel[0],"user channel fetched successful")
    )
})

export {
    registerUser,
    loginUser,
    logutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile
}